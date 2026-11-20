package services.scene

import java.nio.file.Path
import java.sql.Connection
import java.time.Instant
import java.util.Base64

import cats.effect.IO
import cats.syntax.all.*
import scala.concurrent.duration.*

import services.curation.tables.PhotoAnalysisTableInitializer
import services.gallery.objects.*
import services.gallery.tables.*
import services.scene.objects.*
import services.scene.objects.apiTypes.RuntimeEvidence
import services.scene.tables.{SceneRunTable, SceneRunTableInitializer}
import services.system.ai.AiRuntime
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Sql, SqlValue}
import services.system.startup.AppRuntime
import services.users.objects.UserId

/**
 * 测试便利扩展：Scala 3 的 for 推导式对非变量模式（如 `(a, b, c) <- io`）会要求 `withFilter`，
 * 而 cats-effect 的 IO 没有该方法。本包测试里 seedExhibition 返回的三元组是 irrefutable 模式，
 * 这里补一个恒等 withFilter，使测试保持声明式解构；仅测试源码可见，不影响生产代码。
 */
extension [A](io: IO[A])
  def withFilter(predicate: A => Boolean): IO[A] = io

/**
 * D5 scene 测试共用基础设施（真实表在 momentarium_ai，与 D4 SceneGenerationSpec 同库）：
 * 建 schema、seed 展览/章节/照片、构造 SceneRun 与合法运行时证据、轮询状态、清理数据。
 */
trait SceneTestSupport:

  protected val AiDatabaseUrl = sys.env.getOrElse("TEST_AI_DB_URL", "jdbc:postgresql://localhost:5432/momentarium_ai")
  protected val TestNow: Instant = Instant.parse("2026-10-27T12:00:00Z")
  protected val CodeLimitKb = 60

  /** 能过 CodeSanitizer 基础校验的最小生成代码（纯程序化场景，不引用 ctx.photos）。 */
  protected val SampleCode: String =
    """function build(ctx) {
      |  const T = ctx.THREE;
      |  ctx.setBackground(0x0f172a);
      |  const ground = new T.Mesh(
      |    new T.CircleGeometry(9, 48),
      |    new T.MeshStandardMaterial({ color: 0x162033, roughness: 0.92, flatShading: true })
      |  );
      |  ground.rotation.x = -Math.PI / 2;
      |  ctx.scene.add(ground);
      |  ctx.camera.position.set(0, 1.6, 6);
      |  ctx.addOrbitControls();
      |  ctx.onFrame((dt) => { ctx.scene.rotation.y += dt * 0.05; });
      |}""".stripMargin

  protected def sampleBrief(userHint: Option[String] = None): SceneBrief =
    SceneBrief(
      mood = "安静的眷恋",
      memoryReading = "海边的光与退潮的痕迹，把这趟旅程收束成克制的想念。",
      scenePrompt =
        "【任务】用 Three.js 生成一个可沉浸游览的纯程序化三维记忆场景，表达这组照片承载的情绪。" +
          "【情绪与记忆】安静的眷恋。【照片叙事】照片仅作为情绪素材，不出现在场景实体中。" +
          "【场景与空间】低多边形海岸地形 + 记忆馆与灯塔；水面有细分波动与泡沫；世界半径约 45m，相机高度约 1.8m。" +
          "【光照与色彩】冷色雾、暖色主光；色调 #0B1020、#F2A65A、#7DD3FC。" +
          "【交互与运动】Orbit 浏览；水面缓推、雾缓慢漂移。【技术与性能】使用 ctx API；不联网、不访问 DOM；目标 60fps。" +
          "【避免】水面纯色无纹理；盒子+三角屋顶的简陋建筑；近黑无主光；大片空带；随机球体堆叠；照片直贴或相框陈列。",
      entranceNarration = "沿着微弱的光走进这片雾里的海岸。",
      palette = List("#0B1020", "#F2A65A", "#7DD3FC"),
      avoid = List(
        "水面纯色无纹理",
        "盒子+三角屋顶的简陋建筑",
        "近黑无主光",
        "大片空带",
        "随机球体堆叠",
        "照片直贴或相框陈列"
      ),
      userHint = userHint
    )

  /** 合法运行时证据：无错误、无网络、fps 达标（photoIdsUsed 已不是门禁，仅保留契约字段）。 */
  protected def validEvidence(photoIds: List[PhotoId]): RuntimeEvidence =
    RuntimeEvidence(
      buildMs = 42,
      fps = 54.5,
      errors = Nil,
      photoIdsUsed = photoIds,
      networkAttempts = 0
    )

  /** 合法 JPEG data URL：硬门禁只校验魔数 ffd8ff 与大小。 */
  protected def jpegDataUrl(tail: Array[Byte] = Array.emptyByteArray): String =
    val bytes = Array[Byte](0xff.toByte, 0xd8.toByte, 0xff.toByte, 0xe0.toByte, 0x00, 0x10, 0x4a, 0x46) ++ tail
    s"data:image/jpeg;base64,${Base64.getEncoder.encodeToString(bytes)}"

  protected val validCaptures: List[String] = List.fill(4)(jpegDataUrl())

  protected def withDatabase(body: (Database, Connection, AppConfig) => IO[Unit]): IO[Unit] =
    loadConfig.flatMap { config =>
      for
        _ <- AiRuntime.initialize(config.ai)
        _ <- Database.resource(config.database).use { database =>
               for
                 _ <- AppRuntime.initialize(config, database)
                 _ <- database.use(connection => initSchemas(connection) *> body(database, connection, config))
               yield ()
             }
      yield ()
    }

  protected def seedExhibition(connection: Connection): IO[(UserId, ExhibitionId, List[ExhibitionPhoto])] =
    for
      userId <- IO.randomUUID.map(UserId.apply)
      exhibitionId = ExhibitionId(java.util.UUID.randomUUID())
      groupId = GroupId(java.util.UUID.randomUUID())
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
        createdAt = TestNow,
        updatedAt = TestNow
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
                   createdAt = TestNow
                 )
               }
      _ <- ExhibitionTable.insert(connection, exhibition)
      _ <- ExhibitionGroupTable.insert(connection, group)
      _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
    yield (userId, exhibitionId, photos)

  protected def newRun(
    userId: UserId,
    exhibitionId: ExhibitionId,
    photos: List[ExhibitionPhoto],
    status: SceneRunStatus = SceneRunStatus.Queued,
    attempts: Int = 0,
    source: Option[SceneSource] = None,
    brief: Option[SceneBrief] = None,
    code: Option[String] = None,
    review: Option[SceneReview] = None,
    kind: SceneRunKind = SceneRunKind.Generate,
    parentRunId: Option[SceneRunId] = None,
    revisionInstruction: Option[String] = None
  ): IO[SceneRun] =
    IO.randomUUID.map(SceneRunId.apply).map { runId =>
      SceneRun(
        id = runId,
        exhibitionId = exhibitionId,
        requestedBy = userId,
        status = status,
        source = source,
        hint = None,
        photoIds = photos.map(_.id),
        curationVersion = 1,
        runtimeVersion = services.scene.utils.SceneContract.RuntimeVersion,
        brief = brief,
        code = code,
        review = review,
        runtimeEvidence = None,
        attempts = attempts,
        promptVersion = "scene-parent-v1",
        errorCode = None,
        errorMessage = None,
        createdAt = TestNow,
        updatedAt = TestNow,
        kind = kind,
        parentRunId = parentRunId,
        revisionInstruction = revisionInstruction
      )
    }

  /** 显式设置当前采用场景指针（v1.14：读取点/发布都按指针，不再自动取最新 succeeded）。 */
  protected def setCurrentRun(connection: Connection, exhibitionId: ExhibitionId, runId: SceneRunId): IO[Unit] =
    ExhibitionTable.setCurrentSceneRun(connection, exhibitionId, runId, TestNow).void

  protected def insertAwaitingCaptureRun(
    userId: UserId,
    exhibitionId: ExhibitionId,
    photos: List[ExhibitionPhoto],
    attempts: Int = 0
  ): IO[SceneRun] =
    for
      run <- newRun(
               userId,
               exhibitionId,
               photos,
               status = SceneRunStatus.AwaitingCapture,
               attempts = attempts,
               source = Some(SceneSource.Ai),
               brief = Some(sampleBrief()),
               code = Some(SampleCode)
             )
      _ <- tableInsert(run)
    yield run

  protected def tableInsert(run: SceneRun): IO[Unit] =
    withConnection(connection => SceneRunTable.insert(connection, run))

  /** 条件更新进入 reviewing（reviewscene 防双花的前置），返回推进后的运行。 */
  protected def claimForReview(
    connection: Connection,
    runId: SceneRunId,
    userId: UserId,
    evidence: RuntimeEvidence
  ): IO[SceneRun] =
    SceneRunTable.claimForReview(connection, runId, userId, evidence, TestNow).flatMap { updated =>
      IO.raiseWhen(updated == 0)(new IllegalStateException(s"claimForReview 未更新运行：${runId.value}")) *>
        requireRun(connection, runId)
    }

  protected def requireRun(connection: Connection, runId: SceneRunId): IO[SceneRun] =
    SceneRunTable.findById(connection, runId).flatMap {
      case Some(run) => IO.pure(run)
      case None => IO.raiseError(new IllegalStateException(s"找不到场景运行：${runId.value}"))
    }

  /** 轮询直到运行进入期望状态之一（生成/修复 fiber 是异步的）。 */
  protected def awaitStatus(
    connection: Connection,
    runId: SceneRunId,
    expected: Set[SceneRunStatus],
    timeout: FiniteDuration = 15.seconds
  ): IO[SceneRun] =
    val interval = 25.millis
    val maxAttempts = math.max(1, (timeout.toMillis / interval.toMillis).toInt)
    def loop(remaining: Int): IO[SceneRun] =
      SceneRunTable.findById(connection, runId).flatMap {
        case Some(run) if expected.contains(run.status) => IO.pure(run)
        case Some(run) if remaining <= 0 =>
          IO.raiseError(
            new IllegalStateException(
              s"等待状态 ${expected.map(SceneRunStatus.toString).mkString("/")} 超时，当前：${SceneRunStatus.toString(run.status)}"
            )
          )
        case None if remaining <= 0 => IO.raiseError(new IllegalStateException(s"等待运行 ${runId.value} 时找不到记录"))
        case _ => IO.sleep(interval) *> IO.defer(loop(remaining - 1))
      }
    loop(maxAttempts)

  protected def cleanup(connection: Connection, exhibitionId: ExhibitionId): IO[Unit] =
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

  private def initSchemas(connection: Connection): IO[Unit] =
    for
      _ <- ExhibitionTableInitializer.initialize(connection)
      _ <- ExhibitionGroupTableInitializer.initialize(connection)
      _ <- ExhibitionPhotoTableInitializer.initialize(connection)
      _ <- PhotoLocationTableInitializer.initialize(connection)
      _ <- PhotoMemoryTableInitializer.initialize(connection)
      // GetExhibitionMessage 的 pendingContributionCount（v1.15）会查投稿表。
      _ <- ContributionTableInitializer.initialize(connection)
      _ <- PublicationTableInitializer.initialize(connection)
      _ <- PhotoAnalysisTableInitializer.initialize(connection)
      _ <- SceneRunTableInitializer.initialize(connection)
    yield ()

  /** 极少数需要独立连接写库的辅助（fiber 之外），避免占用测试主连接的事务语义。 */
  private def withConnection[A](body: Connection => IO[A]): IO[A] =
    AppRuntime.database.flatMap(database => database.use(body))

  private def loadConfig: IO[AppConfig] =
    DotEnv.load(Path.of(".env")).flatMap { dotEnv =>
      val environment = dotEnv ++ sys.env ++ Map(
        "DB_URL" -> AiDatabaseUrl,
        "AI_MODE" -> "fake",
        "DATA_DIR" -> "target/scene-test-data"
      )
      AppConfig.load(environment) match
        case Right(config) => IO.pure(config)
        case Left(error) => IO.raiseError(new IllegalStateException(s"测试配置无效：$error"))
    }
