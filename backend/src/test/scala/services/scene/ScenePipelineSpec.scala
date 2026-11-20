package services.scene

import java.util.concurrent.atomic.AtomicInteger

import cats.effect.IO

import munit.CatsEffectSuite

import services.scene.api.{CancelSceneMessage, ReviewSceneMessage}
import services.scene.objects.*
import services.scene.objects.apiTypes.{RuntimeEvidence, SceneRunView}
import services.scene.tables.SceneRunTable
import services.scene.utils.{FallbackScene, SceneReviewFlow, SceneRunViews}
import services.system.ai.AiPorts
import services.system.ai.fake.{FakeLocationModel, FakeTextModel, FakeVisionModel}
import services.system.ai.objects.{ImageBytes, ReviewPrompt}
import services.system.ai.ports.ReviewModel
import services.system.api.{ApiException, ErrorCode}
import services.system.db.Database
import services.system.config.AppConfig
import services.users.objects.UserId

/**
 * reviewscene 评审流水线（spec §9.5/§9.6），DB=momentarium_ai + 注入 Fake/脚本化端口：
 * 一次通过、不通过→修订→通过、用尽→兜底、门禁失败不入 VLM、构建崩溃独立修复、
 * VLM 无效→重评一次后按修订处理、防双花与状态冲突。
 */
class ScenePipelineSpec extends CatsEffectSuite with SceneTestSupport:

  /** 按顺序返回五维分数的评审模型（服务端会重算 verdict）；分数用尽后固定返回 2 分。 */
  private final class ScriptedReviewModel(scores: List[RubricScores]) extends ReviewModel:
    private val index = AtomicInteger(0)

    def callCount: Int = index.get()

    override def review(prompt: ReviewPrompt, captures: List[ImageBytes]): IO[SceneReview] =
      IO {
        val position = index.getAndIncrement()
        val score = scores.lift(position).getOrElse(RubricScores(2, 2, 2, 2, 2))
        SceneReview(score, ReviewVerdict.Pass, List("左前景照片偏小、低于视线高度"), s"第 ${position + 1} 次评审")
      }

  /** 按步骤返回：Left=抛异常，Right=给定分数；步骤用尽后固定返回 2 分。 */
  private final class StepReviewModel(steps: List[Either[Throwable, RubricScores]]) extends ReviewModel:
    private val index = AtomicInteger(0)

    def callCount: Int = index.get()

    override def review(prompt: ReviewPrompt, captures: List[ImageBytes]): IO[SceneReview] =
      IO(index.getAndIncrement()).flatMap { position =>
        steps.lift(position) match
          case Some(Left(error)) => IO.raiseError(error)
          case Some(Right(score)) =>
            IO.pure(
              SceneReview(score, ReviewVerdict.Pass, List("左前景照片偏小、低于视线高度"), s"第 ${position + 1} 次评审")
            )
          case None =>
            IO.pure(SceneReview(RubricScores(2, 2, 2, 2, 2), ReviewVerdict.Pass, List("左前景照片偏小"), s"第 ${position + 1} 次评审"))
      }

  private val lowScores = List.fill(10)(RubricScores(2, 2, 2, 2, 2))
  private val highScores = RubricScores(4, 4, 4, 4, 4)

  test("一次通过：reviewscene → succeeded(source=ai)，重复回传 409 CONFLICT") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        evidence = validEvidence(run.photoIds)
        view <- ReviewSceneMessage(userId, run.id, validCaptures, evidence).plan(connection)
        _ = assertEquals(view.status, SceneRunStatus.Succeeded)
        _ = assertEquals(view.source, Some(SceneSource.Ai))
        _ = assertEquals(view.attempts, 0)
        _ = assert(view.review.exists(_.verdict == ReviewVerdict.Pass))
        _ = assert(view.review.exists(_.scores == highScores), "fake 评审应为 4/4/4/4/4")
        _ <- expectApiError(ReviewSceneMessage(userId, run.id, validCaptures, evidence).plan(connection))(
               ErrorCode.Conflict
             )
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("纯场景：photoIdsUsed 为空不再是门禁，reviewscene 仍可 pass") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        evidence = validEvidence(run.photoIds).copy(photoIdsUsed = Nil)
        view <- ReviewSceneMessage(userId, run.id, validCaptures, evidence).plan(connection)
        _ = assertEquals(view.status, SceneRunStatus.Succeeded)
        _ = assertEquals(view.source, Some(SceneSource.Ai))
        _ = assert(view.review.exists(_.verdict == ReviewVerdict.Pass))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("防双花：同一 awaiting_capture 运行只能被 claim 一次") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        evidence = validEvidence(run.photoIds)
        first <- SceneRunTable.claimForReview(connection, run.id, userId, evidence, TestNow)
        second <- SceneRunTable.claimForReview(connection, run.id, userId, evidence, TestNow)
        _ = assertEquals(first, 1)
        _ = assertEquals(second, 0)
        claiming <- requireRun(connection, run.id)
        _ = assertEquals(claiming.status, SceneRunStatus.Reviewing)
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("不通过→修订→通过：attempts=1 回 generating，修复完成后二次评审通过") {
    withDatabase { (database, connection, config) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        scripted = new ScriptedReviewModel(List(lowScores.head, highScores))
        ports = AiPorts(FakeTextModel(), FakeVisionModel(), FakeLocationModel(), scripted)
        evidence = validEvidence(run.photoIds)
        first <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ = assertEquals(first.attempts, 1)
        _ = assert(
              Set(SceneRunStatus.Generating, SceneRunStatus.AwaitingCapture).contains(first.status),
              s"修订后应回到 generating/awaiting_capture，实际：${first.status}"
            )
        _ = assert(first.review.exists(_.verdict == ReviewVerdict.Revise))
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        second <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ = assertEquals(second.status, SceneRunStatus.Succeeded)
        _ = assertEquals(second.source, Some(SceneSource.Ai))
        _ = assertEquals(second.attempts, 1)
        _ = assert(second.review.exists(_.verdict == ReviewVerdict.Pass))
        _ = assertEquals(scripted.callCount, 2)
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("用尽修订：attempts 0→1→2 后第 3 次不通过 → succeeded(fallback) 保留 review，不再回 generating") {
    withDatabase { (database, connection, config) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        scripted = new ScriptedReviewModel(lowScores)
        ports = AiPorts(FakeTextModel(), FakeVisionModel(), FakeLocationModel(), scripted)
        evidence = validEvidence(run.photoIds)
        round1 <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ = assertEquals(round1.attempts, 1)
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        round2 <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ = assertEquals(round2.attempts, 2)
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        round3 <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ = assertEquals(round3.status, SceneRunStatus.Succeeded)
        _ = assertEquals(round3.source, Some(SceneSource.Fallback))
        _ = assertEquals(round3.attempts, 2)
        _ = assertEquals(round3.code, Some(FallbackScene.code))
        _ = assert(round3.review.exists(_.verdict == ReviewVerdict.Revise), "兜底后仍需保留评审结果")
        _ = assertEquals(scripted.callCount, 3)
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("第 3 次评审 VLM 异常：兜底仍保留上一轮 review（verdict=revise + issues，DB/API 非 null）") {
    withDatabase { (database, connection, config) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        steps = List[Either[Throwable, RubricScores]](
                  Right(RubricScores(2, 2, 2, 2, 2)),
                  Right(RubricScores(2, 2, 2, 2, 2)),
                  Left(new IllegalStateException("测试注入：第 3 次 VLM 输出解析失败")),
                  Left(new IllegalStateException("测试注入：重新评审仍解析失败"))
                )
        model = new StepReviewModel(steps)
        ports = AiPorts(FakeTextModel(), FakeVisionModel(), FakeLocationModel(), model)
        evidence = validEvidence(run.photoIds)
        first <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ = assertEquals(first.attempts, 1)
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        second <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ = assertEquals(second.attempts, 2)
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        finalRun <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        view = SceneRunViews.view(finalRun)
        _ = assertEquals(model.callCount, 4, "第 3 轮评审无效时应重新评审一次")
        _ = assertEquals(finalRun.status, SceneRunStatus.Succeeded)
        _ = assertEquals(finalRun.source, Some(SceneSource.Fallback))
        _ = assertEquals(finalRun.attempts, 2)
        _ = assertEquals(finalRun.code, Some(FallbackScene.code))
        _ = assert(view.review.nonEmpty, "兜底后 API review 不能为 null（spec §9.6）")
        _ = assertEquals(view.review.map(_.verdict), Some(ReviewVerdict.Revise), "保留的 review 必须是上一轮 revise")
        _ = assert(view.review.exists(_.scores == RubricScores(2, 2, 2, 2, 2)), "scores/summary 应保留上一轮")
        _ = assert(view.review.exists(_.issues.nonEmpty), "issues 必须保留")
        _ = assert(
              view.review.exists(_.issues.exists(_.contains("沿用上一轮"))),
              "第 3 次解析失败的诊断应写入 review.issues（不静默丢弃）"
            )
        reloaded <- requireRun(connection, run.id)
        _ = assert(reloaded.review.nonEmpty, "DB review_json 必须非空")
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("第 3 次评审输出非法（分数越界）：兜底同样保留上一轮 review 与诊断 issues") {
    withDatabase { (database, connection, config) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        steps = List[Either[Throwable, RubricScores]](
                  Right(RubricScores(2, 2, 2, 2, 2)),
                  Right(RubricScores(2, 2, 2, 2, 2)),
                  Right(RubricScores(9, 9, 9, 9, 9)),
                  Right(RubricScores(9, 9, 9, 9, 9))
                )
        model = new StepReviewModel(steps)
        ports = AiPorts(FakeTextModel(), FakeVisionModel(), FakeLocationModel(), model)
        evidence = validEvidence(run.photoIds)
        _ <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        _ <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        finalRun <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        view = SceneRunViews.view(finalRun)
        _ = assertEquals(finalRun.status, SceneRunStatus.Succeeded)
        _ = assertEquals(finalRun.source, Some(SceneSource.Fallback))
        _ = assert(view.review.nonEmpty, "输出非法也必须保留上一轮 review")
        _ = assertEquals(view.review.map(_.verdict), Some(ReviewVerdict.Revise))
        _ = assert(view.review.exists(_.scores == RubricScores(2, 2, 2, 2, 2)))
        _ = assert(
              view.review.exists(_.issues.exists(_.contains("沿用上一轮"))),
              "非法输出诊断应写入 review.issues"
            )
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("门禁失败：不调用 VLM、200 返回并回 generating 修订；连续门禁失败用尽后兜底且 review 非空") {
    withDatabase { (database, connection, config) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        scripted = new ScriptedReviewModel(highScores :: Nil)
        ports = AiPorts(FakeTextModel(), FakeVisionModel(), FakeLocationModel(), scripted)
        badEvidence = validEvidence(run.photoIds).copy(
                        errors = List("TypeError: cannot read property 'position' of undefined"),
                        networkAttempts = 1
                      )
        round1 <- reviewWithPorts(connection, database, ports, config, run.id, userId, badEvidence)
        _ = assertEquals(scripted.callCount, 0, "硬门禁失败不得调用 VLM")
        _ = assertEquals(round1.attempts, 1)
        _ = assert(
              round1.review.exists(_.scores == RubricScores(1, 1, 1, 1, 1)),
              "门禁评审 scores 必须全 1（未进入 VLM 评分）"
            )
        _ = assert(round1.review.exists(_.summary.startsWith("硬门禁未通过：")))
        _ = assert(round1.review.exists(_.issues.exists(_.contains("运行时存在错误"))))
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        round2 <- reviewWithPorts(connection, database, ports, config, run.id, userId, badEvidence)
        _ = assertEquals(round2.attempts, 2)
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        round3 <- reviewWithPorts(connection, database, ports, config, run.id, userId, badEvidence)
        _ = assertEquals(round3.status, SceneRunStatus.Succeeded)
        _ = assertEquals(round3.source, Some(SceneSource.Fallback))
        _ = assert(round3.review.nonEmpty, "门禁失败用尽兜底时 review 必须非空")
        _ = assert(round3.review.exists(_.issues.exists(_.contains("网络请求"))))
        _ = assertEquals(scripted.callCount, 0)
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("VLM 持续无效：重新评审一次后按需要修订处理（不丢弃已渲染代码），额度用尽才兜底并保留诊断") {
    withDatabase { (database, connection, config) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        model = new StepReviewModel(List.fill(6)(Left(new IllegalStateException("测试注入：VLM 异常"))))
        ports = AiPorts(FakeTextModel(), FakeVisionModel(), FakeLocationModel(), model)
        evidence = validEvidence(run.photoIds)
        round1 <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ = assertEquals(model.callCount, 2, "无效评审应重新评审一次")
        _ = assertEquals(round1.attempts, 1, "评审无效且有额度时按修订处理")
        _ = assert(round1.review.exists(_.issues.head.contains("没有得到有效结果")), s"${round1.review}")
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        _ <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        round3 <- reviewWithPorts(connection, database, ports, config, run.id, userId, evidence)
        _ = assertEquals(round3.status, SceneRunStatus.Succeeded)
        _ = assertEquals(round3.source, Some(SceneSource.Fallback))
        _ = assertEquals(round3.attempts, 2)
        _ = assertEquals(round3.code, Some(FallbackScene.code))
        _ = assert(round3.review.exists(_.issues.exists(_.contains("沿用上一轮"))), "兜底时写明评审无效的诊断")
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("构建阶段崩溃：先用独立的构建修复额度（attempts 不变），再次崩溃才占用质量修订") {
    withDatabase { (database, connection, config) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        scripted = new ScriptedReviewModel(highScores :: Nil)
        ports = AiPorts(FakeTextModel(), FakeVisionModel(), FakeLocationModel(), scripted)
        crashed = validEvidence(run.photoIds).copy(
                    fps = 0,
                    errors = List("build: CODE_INVALID: Identifier 'leafGeo' has already been declared")
                  )
        round1 <- reviewWithPorts(connection, database, ports, config, run.id, userId, crashed, captures = Nil)
        _ = assertEquals(round1.attempts, 0, "构建修复不占修订额度")
        _ = assertEquals(round1.buildRepairs, 1)
        _ = assert(round1.review.exists(_.issues.exists(_.contains("构建阶段崩溃"))))
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        round2 <- reviewWithPorts(connection, database, ports, config, run.id, userId, crashed, captures = Nil)
        _ = assertEquals(round2.attempts, 1, "构建修复额度用完后占用质量修订")
        _ = assertEquals(round2.buildRepairs, 1)
        _ = assertEquals(scripted.callCount, 0, "构建崩溃不调用 VLM")
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("门禁失败走 reviewscene 返回 200 推进（不是 400/409），attempts=1 且 review 非 VLM 分数") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        badEvidence = validEvidence(run.photoIds).copy(fps = 8.0)
        view <- ReviewSceneMessage(userId, run.id, validCaptures, badEvidence).plan(connection)
        _ = assertEquals(view.attempts, 1)
        _ = assert(view.review.exists(_.scores == RubricScores(1, 1, 1, 1, 1)))
        _ = assert(view.review.exists(_.summary.startsWith("硬门禁未通过：")))
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.AwaitingCapture))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("状态/归属冲突：generating 与 failed 不可评审 → 409；他人运行 → 404；取消后回传 → 409") {
    withDatabase { (_, connection, _) =>
      for
        generatingSeed <- seedExhibition(connection)
        generatingUser = generatingSeed._1
        generatingExhibitionId = generatingSeed._2
        generatingPhotos = generatingSeed._3
        generating <- newRun(generatingUser, generatingExhibitionId, generatingPhotos, status = SceneRunStatus.Generating)
        _ <- SceneRunTable.insert(connection, generating)
        _ <- expectApiError(
               ReviewSceneMessage(generatingUser, generating.id, validCaptures, validEvidence(generating.photoIds))
                 .plan(connection)
             )(ErrorCode.Conflict)
        awaitingSeed <- seedExhibition(connection)
        awaitingUser = awaitingSeed._1
        awaitingExhibitionId = awaitingSeed._2
        awaitingPhotos = awaitingSeed._3
        failed <- newRun(awaitingUser, awaitingExhibitionId, awaitingPhotos, status = SceneRunStatus.Failed)
        _ <- SceneRunTable.insert(connection, failed)
        awaiting <- insertAwaitingCaptureRun(awaitingUser, awaitingExhibitionId, awaitingPhotos)
        evidence = validEvidence(awaiting.photoIds)
        _ <- expectApiError(ReviewSceneMessage(awaitingUser, failed.id, validCaptures, evidence).plan(connection))(
               ErrorCode.Conflict
             )
        otherUser <- IO.randomUUID.map(UserId.apply)
        _ <- expectApiError(ReviewSceneMessage(otherUser, awaiting.id, validCaptures, evidence).plan(connection))(
               ErrorCode.NotFound
             )
        _ <- CancelSceneMessage(awaitingUser, awaiting.id).plan(connection)
        _ <- expectApiError(ReviewSceneMessage(awaitingUser, awaiting.id, validCaptures, evidence).plan(connection))(
               ErrorCode.Conflict
             )
        _ <- cleanup(connection, generatingExhibitionId)
        _ <- cleanup(connection, awaitingExhibitionId)
      yield ()
    }
  }

  // ---------- 辅助 ----------

  private def reviewWithPorts(
    connection: java.sql.Connection,
    database: Database,
    ports: AiPorts,
    config: AppConfig,
    runId: SceneRunId,
    userId: UserId,
    evidence: RuntimeEvidence,
    captures: List[String] = validCaptures
  ): IO[SceneRun] =
    claimForReview(connection, runId, userId, evidence).flatMap(run =>
      SceneReviewFlow.run(connection, database, ports, config, run, captures, evidence)
    )

  private def expectApiError(io: IO[SceneRunView])(expected: ErrorCode): IO[Unit] =
    io.attempt.flatMap {
      case Left(ApiException(error)) => IO(assertEquals(error.code, expected))
      case Left(other) => IO.raiseError(other)
      case Right(view) => IO(fail(s"期望 $expected，但成功返回：status=${SceneRunStatus.toString(view.status)}"))
    }