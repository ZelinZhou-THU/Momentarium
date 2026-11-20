package services.scene

import java.nio.file.Path
import java.sql.Connection
import java.time.Instant
import java.util.UUID

import cats.effect.{IO, Ref}
import cats.syntax.all.*
import io.circe.{Decoder, Json}
import scala.concurrent.duration.*

import munit.CatsEffectSuite

import services.curation.tables.PhotoAnalysisTableInitializer
import services.gallery.objects.*
import services.gallery.tables.*
import services.scene.api.{GenerateSceneMessage, GetSceneRunMessage}
import services.scene.objects.*
import services.scene.objects.apiTypes.SceneRunView
import services.scene.tables.{SceneRunTable, SceneRunTableInitializer}
import services.scene.utils.{CodeSanitizer, FallbackScene, SceneGeneration}
import services.system.ai.{AiPorts, AiRuntime}
import services.system.ai.fake.{FakeLocationModel, FakeReviewModel, FakeTextModel, FakeVisionModel}
import services.system.ai.objects.{StructuredPrompt, TextPrompt}
import services.system.ai.ports.TextModel
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Sql, SqlValue}
import services.system.startup.AppRuntime
import services.users.objects.UserId

/**
 * scene 生成链路（D4，真实表在 momentarium_ai）：
 * Queued→Generating→AwaitingCapture、幂等、模型失败→Failed 等待重试（不再用通用兜底题面）、服务重启清理。
 */
class SceneGenerationSpec extends CatsEffectSuite:

  private val now = Instant.parse("2026-10-27T12:00:00Z")
  private val aiDatabaseUrl = sys.env.getOrElse("TEST_AI_DB_URL", "jdbc:postgresql://localhost:5432/momentarium_ai")
  private val codeLimitKb = 60

  /** 必失败的文本模型：验证「模型失败 → Failed 等待用户重试」路径。 */
  private final class FailingTextModel extends TextModel:
    override def structured[A: Decoder](prompt: StructuredPrompt): IO[A] =
      IO.raiseError(new IllegalStateException("测试注入：模型失败"))
    override def complete(prompt: TextPrompt): IO[String] =
      IO.raiseError(new IllegalStateException("测试注入：模型失败"))

  test("generatescene：进入 AwaitingCapture 且 code 非空，getscenerun 可读，重复调用幂等") {
    withDatabase { (database, connection) =>
      for
        seeded <- seedExhibition(connection)
        (userId, exhibitionId, photos) = seeded
        first <- GenerateSceneMessage(userId, exhibitionId, Some("想要安静一点")).plan(connection)
        _ = assert(
              first.status == SceneRunStatus.Queued || first.status == SceneRunStatus.Generating,
              s"generatescene 应立即返回排队/生成中，实际：${first.status}"
            )
        completed <- awaitStatus(userId, exhibitionId, connection, SceneRunStatus.AwaitingCapture)
        _ = assertEquals(completed.source, Some(SceneSource.Ai))
        _ = assert(completed.code.exists(_.nonEmpty), "awaiting_capture 必须带非空 code")
        _ = assert(
              completed.code.forall(code => !code.contains("ctx.photos")),
              "纯场景 fake 代码不得引用 ctx.photos/照片纹理"
            )
        _ = assert(
              completed.code.exists(code => code.contains("PlaneGeometry")),
              "设计感 v3 fake 代码必须包含可读水面（PlaneGeometry 细分）"
            )
        _ = assert(
              completed.code.exists(code => code.contains("BoxGeometry") && code.contains("CylinderGeometry")),
              "设计感 v3 fake 代码必须包含建筑构件与地标几何"
            )
        _ = assert(
              completed.code.exists(code => CodeSanitizer.sanitize(code, codeLimitKb).isRight),
              "生成代码应通过基础清洗/结构校验"
            )
        _ = assertEquals(completed.photoIds.toSet, photos.map(_.id).toSet, "photoIds 快照应覆盖全部照片")
        _ = assert(completed.brief.exists(_.scenePrompt.nonEmpty), "运行应带上题面 brief")
        second <- GenerateSceneMessage(userId, exhibitionId, None).plan(connection)
        _ = assertEquals(second.runId, completed.runId, "已有活跃运行时 generatescene 必须幂等返回同一个 run")
        latest <- GetSceneRunMessage(userId, exhibitionId).plan(connection)
        _ = assertEquals(latest.runId, completed.runId)
        _ = assertEquals(latest.status, SceneRunStatus.AwaitingCapture)
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("题面/代码生成失败：运行置为 failed(GENERATION_FAILED) 并提示重新生成，不改用通用兜底题面") {
    withDatabase { (database, connection) =>
      for
        seeded <- seedExhibition(connection)
        (userId, exhibitionId, photos) = seeded
        run <- newQueuedRun(userId, exhibitionId, photos)
        _ <- SceneRunTable.insert(connection, run)
        failingPorts = AiPorts(new FailingTextModel(), FakeVisionModel(), FakeLocationModel(), FakeReviewModel())
        _ <- SceneGeneration.runWith(database, failingPorts, run.id)
        reloaded <- requireRun(connection, run.id)
        _ = assertEquals(reloaded.status, SceneRunStatus.Failed)
        _ = assertEquals(reloaded.errorCode, Some("GENERATION_FAILED"))
        _ = assert(reloaded.errorMessage.exists(_.contains("请重新生成")), s"${reloaded.errorMessage}")
        _ = assertEquals(reloaded.source, None, "失败运行没有场景来源")
        _ = assertEquals(reloaded.brief, None, "不得写入与照片无关的兜底题面")
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("修复阶段生成失败：同样置为 failed，不改用兜底场景") {
    withDatabase { (database, connection) =>
      for
        seeded <- seedExhibition(connection)
        (userId, exhibitionId, photos) = seeded
        queued <- newQueuedRun(userId, exhibitionId, photos)
        _ <- SceneRunTable.insert(connection, queued)
        _ <- SceneGeneration.runWith(database, AiPorts(FakeTextModel(), FakeVisionModel(), FakeLocationModel(), FakeReviewModel()), queued.id)
        generated <- requireRun(connection, queued.id)
        _ <- Sql.update(
               connection,
               "UPDATE scene.scene_runs SET status = 'generating', attempts = 1 WHERE id = ?",
               List(SqlValue.Uuid(queued.id.value))
             )
        failingPorts = AiPorts(new FailingTextModel(), FakeVisionModel(), FakeLocationModel(), FakeReviewModel())
        _ <- SceneGeneration.reviseWith(database, failingPorts, queued.id, List("composition｜截图1｜圆门偏小"))
        reloaded <- requireRun(connection, queued.id)
        _ = assertEquals(reloaded.status, SceneRunStatus.Failed)
        _ = assertEquals(reloaded.brief, generated.brief, "保留 AI 按照片写的题面")
        _ = assertEquals(reloaded.code, generated.code, "修复失败保留原代码，不改写为兜底")
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("兜底场景本身仍满足纯场景约束（只用于评审额度用尽的最终结果）") {
    assert(CodeSanitizer.sanitize(FallbackScene.code, codeLimitKb).isRight, "兜底代码必须能通过基础校验")
    assert(!FallbackScene.code.contains("ctx.photos"), "兜底场景必须是纯程序化，不得使用照片纹理")
    assert(!FallbackScene.code.contains("photo"), "兜底场景不得出现照片实体/变量")
    assert(FallbackScene.code.contains("PlaneGeometry"), "设计感 v3 兜底必须包含可读水面")
    assert(
      FallbackScene.code.contains("BoxGeometry") && FallbackScene.code.contains("CylinderGeometry"),
      "设计感 v3 兜底必须包含建筑构件与灯塔几何"
    )
    assert(FallbackScene.code.contains("ctx.onFrame"), "兜底必须有环境动画（水面/雾）")
  }

  /** 写代码时回头读库：记录此刻运行是否已带题面（SC-03：题面先落库，前端才能显示"正在写场景代码"）。 */
  private final class BriefObservingTextModel(connection: Connection, runId: SceneRunId, seen: Ref[IO, Option[SceneRun]]) extends TextModel:
    private val fake = FakeTextModel()
    override def structured[A: Decoder](prompt: StructuredPrompt): IO[A] = fake.structured[A](prompt)
    override def complete(prompt: TextPrompt): IO[String] =
      SceneRunTable.findById(connection, runId).flatMap(seen.set) *> fake.complete(prompt)

  test("题面写完即落库：代码生成期间运行仍是 generating 且已带 brief") {
    withDatabase { (database, connection) =>
      for
        seeded <- seedExhibition(connection)
        (userId, exhibitionId, photos) = seeded
        run <- newQueuedRun(userId, exhibitionId, photos)
        _ <- SceneRunTable.insert(connection, run)
        seen <- Ref.of[IO, Option[SceneRun]](None)
        ports = AiPorts(new BriefObservingTextModel(connection, run.id, seen), FakeVisionModel(), FakeLocationModel(), FakeReviewModel())
        _ <- SceneGeneration.runWith(database, ports, run.id)
        during <- seen.get
        _ = assertEquals(during.map(_.status), Some(SceneRunStatus.Generating))
        _ = assert(during.exists(_.brief.exists(_.scenePrompt.nonEmpty)), "写代码时题面应已落库")
        _ = assert(during.exists(_.code.isEmpty), "代码尚未写入")
        reloaded <- requireRun(connection, run.id)
        _ = assertEquals(reloaded.status, SceneRunStatus.AwaitingCapture)
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  /** 第一次返回不合规题面（palette 为空、改写了 userHint），之后按示例返回；记录每次题面提示词。 */
  private final class FlakyBriefTextModel(prompts: Ref[IO, List[StructuredPrompt]]) extends TextModel:
    private val fake = FakeTextModel()
    override def structured[A: Decoder](prompt: StructuredPrompt): IO[A] =
      prompts.getAndUpdate(_ :+ prompt).flatMap { previous =>
        if previous.nonEmpty then fake.structured[A](prompt)
        else
          val broken = prompt.responseExample.mapObject(
            _.add("palette", Json.arr()).add("userHint", Json.fromString("模型自己改写的提示"))
          )
          IO.fromEither(summon[Decoder[A]].decodeJson(broken))
      }
    override def complete(prompt: TextPrompt): IO[String] = fake.complete(prompt)

  test("父题面不合规时带原因重写一次；userHint 回填为用户原文") {
    withDatabase { (database, connection) =>
      for
        seeded <- seedExhibition(connection)
        (userId, exhibitionId, photos) = seeded
        run <- newQueuedRun(userId, exhibitionId, photos)
        _ <- SceneRunTable.insert(connection, run)
        prompts <- Ref.of[IO, List[StructuredPrompt]](Nil)
        ports = AiPorts(new FlakyBriefTextModel(prompts), FakeVisionModel(), FakeLocationModel(), FakeReviewModel())
        _ <- SceneGeneration.runWith(database, ports, run.id)
        reloaded <- requireRun(connection, run.id)
        sent <- prompts.get
        _ = assertEquals(sent.size, 2, "不合规题面应且只应重写一次")
        _ = assert(sent(1).instructions.contains("未通过服务端校验"))
        _ = assert(sent(1).instructions.contains("palette 应为"))
        _ = assertEquals(reloaded.source, Some(SceneSource.Ai))
        _ = assertEquals(reloaded.brief.flatMap(_.userHint), run.hint)
        _ = assert(reloaded.brief.exists(_.palette.nonEmpty))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("服务重启清理：遗留活跃运行被标记 failed(SERVER_RESTARTED)") {
    withDatabase { (database, connection) =>
      for
        seeded <- seedExhibition(connection)
        (userId, exhibitionId, photos) = seeded
        run <- newQueuedRun(userId, exhibitionId, photos)
        _ <- SceneRunTable.insert(connection, run)
        _ <- SceneRunTableInitializer.initialize(connection)
        reloaded <- requireRun(connection, run.id)
        _ = assertEquals(reloaded.status, SceneRunStatus.Failed)
        _ = assertEquals(reloaded.errorCode, Some("SERVER_RESTARTED"))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  // ---------- 测试基础设施 ----------

  private def withDatabase(body: (Database, Connection) => IO[Unit]): IO[Unit] =
    loadConfig.flatMap { config =>
      for
        _ <- AiRuntime.initialize(config.ai)
        _ <- Database.resource(config.database).use { database =>
               for
                 _ <- AppRuntime.initialize(config, database)
                 _ <- database.use(connection => initSchemas(connection) *> body(database, connection))
               yield ()
             }
      yield ()
    }

  private def initSchemas(connection: Connection): IO[Unit] =
    for
      _ <- ExhibitionTableInitializer.initialize(connection)
      _ <- ExhibitionGroupTableInitializer.initialize(connection)
      _ <- ExhibitionPhotoTableInitializer.initialize(connection)
      _ <- PhotoAnalysisTableInitializer.initialize(connection)
      _ <- SceneRunTableInitializer.initialize(connection)
    yield ()

  private def seedExhibition(connection: Connection): IO[(UserId, ExhibitionId, List[ExhibitionPhoto])] =
    for
      userId <- IO.randomUUID.map(UserId.apply)
      exhibitionId = ExhibitionId(UUID.randomUUID())
      groupId = GroupId(UUID.randomUUID())
      photoIds <- List.fill(3)(IO.randomUUID.map(PhotoId.apply)).sequence
      exhibition = Exhibition(
        id = exhibitionId,
        ownerId = userId,
        title = "济州的三天",
        narrative = "从海边到山里的三天，记住风和光。",
        curationVersion = 1,
        coverKind = CoverKind.Auto,
        coverPhotoId = None,
        coverStorageKey = None,
        coverMime = None,
        coverWidth = None,
        coverHeight = None,
        createdAt = now,
        updatedAt = now
      )
      group = ExhibitionGroup(groupId, exhibitionId, "海边的黄昏", "第一天的记忆", 0)
      photos = photoIds.zipWithIndex.map { case (photoId, index) =>
                 ExhibitionPhoto(
                   id = photoId,
                   exhibitionId = exhibitionId,
                   storageKey = s"${exhibitionId.value}/${photoId.value}.jpg",
                   thumbKey = s"${exhibitionId.value}/${photoId.value}.thumb.jpg",
                   originalName = s"jeju-$index.jpg",
                   mime = "image/jpeg",
                   width = Some(1024),
                   height = Some(683),
                   groupId = Some(groupId),
                   positionInGroup = Some(index),
                   caption = s"海边的第 ${index + 1} 张",
                   archivedAt = None,
                   createdAt = now
                 )
               }
      _ <- ExhibitionTable.insert(connection, exhibition)
      _ <- ExhibitionGroupTable.insert(connection, group)
      _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
    yield (userId, exhibitionId, photos)

  private def newQueuedRun(
    userId: UserId,
    exhibitionId: ExhibitionId,
    photos: List[ExhibitionPhoto]
  ): IO[SceneRun] =
    IO.randomUUID.map(SceneRunId.apply).map { runId =>
      SceneRun(
        id = runId,
        exhibitionId = exhibitionId,
        requestedBy = userId,
        status = SceneRunStatus.Queued,
        source = None,
        hint = None,
        photoIds = photos.map(_.id),
        curationVersion = 1,
        runtimeVersion = "1",
        brief = None,
        code = None,
        review = None,
        runtimeEvidence = None,
        attempts = 0,
        promptVersion = "scene-parent-v1",
        errorCode = None,
        errorMessage = None,
        createdAt = now,
        updatedAt = now
      )
    }

  private def requireRun(connection: Connection, runId: SceneRunId): IO[SceneRun] =
    SceneRunTable.findById(connection, runId).flatMap {
      case Some(run) => IO.pure(run)
      case None => IO.raiseError(new IllegalStateException(s"找不到场景运行：${runId.value}"))
    }

  private def awaitStatus(
    userId: UserId,
    exhibitionId: ExhibitionId,
    connection: Connection,
    expected: SceneRunStatus
  ): IO[SceneRunView] =
    val attempts = (10.seconds.toMillis / 50).toInt
    def loop(remaining: Int): IO[SceneRunView] =
      GetSceneRunMessage(userId, exhibitionId).plan(connection).flatMap { view =>
        if view.status == expected then IO.pure(view)
        else if remaining <= 0 then
          IO.raiseError(new IllegalStateException(s"等待状态 $expected 超时，当前：${view.status}"))
        else IO.sleep(50.millis) *> loop(remaining - 1)
      }
    loop(attempts)

  private def cleanup(connection: Connection, exhibitionId: ExhibitionId): IO[Unit] =
    for
      _ <- Sql.update(
             connection,
             "DELETE FROM scene.scene_runs WHERE exhibition_id = ?",
             List(SqlValue.Uuid(exhibitionId.value))
           )
      _ <- Sql.update(
             connection,
             "DELETE FROM gallery.exhibitions WHERE id = ?",
             List(SqlValue.Uuid(exhibitionId.value))
           )
    yield ()

  private def loadConfig: IO[AppConfig] =
    DotEnv.load(Path.of(".env")).flatMap { dotEnv =>
      val environment = dotEnv ++ sys.env ++ Map(
        "DB_URL" -> aiDatabaseUrl,
        "AI_MODE" -> "fake"
      )
      AppConfig.load(environment) match
        case Right(config) => IO.pure(config)
        case Left(error) => IO.raiseError(new IllegalStateException(s"测试配置无效：$error"))
    }