package services.scene

import java.util.concurrent.atomic.AtomicInteger

import cats.effect.IO
import io.circe.Decoder
import scala.concurrent.duration.*

import munit.CatsEffectSuite

import services.scene.api.{CancelSceneMessage, GenerateSceneMessage}
import services.scene.objects.*
import services.scene.objects.apiTypes.SceneRunView
import services.scene.tables.SceneRunTable
import services.scene.utils.{SceneGeneration, SceneJobs}
import services.system.ai.AiPorts
import services.system.ai.fake.{FakeLocationModel, FakeReviewModel, FakeTextModel, FakeVisionModel}
import services.system.ai.objects.{StructuredPrompt, TextPrompt}
import services.system.ai.ports.TextModel
import services.system.api.{ApiException, ErrorCode}
import services.users.objects.UserId

/**
 * cancelscene（spec §9.6 取消语义）：生成中取消 fiber 且不再产生后续调用、AwaitingCapture 直接取消、
 * 终态 CONFLICT、他人/不存在 NOT_FOUND、取消后可重新生成。
 */
class SceneCancelSpec extends CatsEffectSuite with SceneTestSupport:

  /** 可取消的慢模型：structured 卡住 5s，用于验证生成中取消后 complete（第二段模型调用）不再发生。 */
  private final class SlowTextModel extends TextModel:
    val structuredCalls = AtomicInteger(0)
    val completeCalls = AtomicInteger(0)

    override def structured[A: Decoder](prompt: StructuredPrompt): IO[A] =
      IO(structuredCalls.incrementAndGet()).void *> IO.sleep(5.seconds) *>
        IO.raiseError(new IllegalStateException("场景生成应已被取消"))

    override def complete(prompt: TextPrompt): IO[String] =
      IO(completeCalls.incrementAndGet()).void *> IO.pure(FakeTextModel.DefaultCompletion)

  test("生成中取消：fiber 被取消、状态 cancelled、后续模型调用不再发生") {
    withDatabase { (database, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- newRun(userId, exhibitionId, photos)
        _ <- SceneRunTable.insert(connection, run)
        slow = new SlowTextModel()
        ports = AiPorts(slow, FakeVisionModel(), FakeLocationModel(), FakeReviewModel())
        _ <- SceneJobs.launch(database, run.id, SceneGeneration.runWith(database, ports, run.id))
        _ <- awaitStatus(connection, run.id, Set(SceneRunStatus.Generating))
        _ <- awaitStructuredCall(slow)
        view <- CancelSceneMessage(userId, run.id).plan(connection)
        _ = assertEquals(view.status, SceneRunStatus.Cancelled)
        _ <- IO.sleep(300.millis)
        reloaded <- requireRun(connection, run.id)
        _ = assertEquals(reloaded.status, SceneRunStatus.Cancelled)
        _ = assertEquals(reloaded.source, None, "取消后的运行不应保留来源")
        _ = assertEquals(slow.structuredCalls.get(), 1, "取消后不应再发起题面模型调用")
        _ = assertEquals(slow.completeCalls.get(), 0, "取消后不应再发起代码模型调用")
        _ <- awaitNoActiveJob()
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("AwaitingCapture 取消：无活跃 fiber，直接置 cancelled") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        view <- CancelSceneMessage(userId, run.id).plan(connection)
        _ = assertEquals(view.status, SceneRunStatus.Cancelled)
        _ = assertEquals(view.source, None)
        active <- SceneJobs.activeCount // 等待渲染的运行本就没有生成 fiber
        _ = assertEquals(active, 0)
        reloaded <- requireRun(connection, run.id)
        _ = assertEquals(reloaded.status, SceneRunStatus.Cancelled)
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("终态取消 → CONFLICT；他人/不存在的运行 → NOT_FOUND") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        succeeded <- newRun(
                       userId,
                       exhibitionId,
                       photos,
                       status = SceneRunStatus.Succeeded,
                       source = Some(SceneSource.Ai),
                       brief = Some(sampleBrief()),
                       code = Some(SampleCode),
                       review = Some(SceneReview(RubricScores(4, 4, 4, 4, 4), ReviewVerdict.Pass, Nil, "通过"))
                     )
        _ <- SceneRunTable.insert(connection, succeeded)
        failed <- newRun(userId, exhibitionId, photos, status = SceneRunStatus.Failed)
        _ <- SceneRunTable.insert(connection, failed)
        awaitRun <- insertAwaitingCaptureRun(userId, exhibitionId, photos)
        _ <- expectApiError(CancelSceneMessage(userId, succeeded.id).plan(connection))(ErrorCode.Conflict)
        _ <- expectApiError(CancelSceneMessage(userId, failed.id).plan(connection))(ErrorCode.Conflict)
        _ <- CancelSceneMessage(userId, awaitRun.id).plan(connection)
        _ <- expectApiError(CancelSceneMessage(userId, awaitRun.id).plan(connection))(ErrorCode.Conflict)
        otherUser <- IO.randomUUID.map(UserId.apply)
        _ <- expectApiError(CancelSceneMessage(otherUser, awaitRun.id).plan(connection))(ErrorCode.NotFound)
        randomRunId <- IO.randomUUID.map(SceneRunId.apply)
        _ <- expectApiError(CancelSceneMessage(userId, randomRunId).plan(connection))(ErrorCode.NotFound)
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("取消后可重新生成：旧运行保持 cancelled，新运行独立完成到 awaiting_capture") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, _) <- seedExhibition(connection)
        first <- GenerateSceneMessage(userId, exhibitionId, None).plan(connection)
        _ <- awaitStatus(connection, first.runId, Set(SceneRunStatus.AwaitingCapture))
        cancelled <- CancelSceneMessage(userId, first.runId).plan(connection)
        _ = assertEquals(cancelled.status, SceneRunStatus.Cancelled)
        second <- GenerateSceneMessage(userId, exhibitionId, Some("再来一次")).plan(connection)
        _ = assertNotEquals(second.runId, first.runId, "取消后应允许创建新的运行")
        done <- awaitStatus(connection, second.runId, Set(SceneRunStatus.AwaitingCapture))
        _ = assertEquals(done.source, Some(SceneSource.Ai))
        previous <- requireRun(connection, first.runId)
        _ = assertEquals(previous.status, SceneRunStatus.Cancelled, "旧运行不应被新运行影响")
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  // ---------- 辅助 ----------

  private def expectApiError(io: IO[SceneRunView])(expected: ErrorCode): IO[Unit] =
    io.attempt.flatMap {
      case Left(ApiException(error)) => IO(assertEquals(error.code, expected))
      case Left(other) => IO.raiseError(other)
      case Right(view) => IO(fail(s"期望 $expected，但成功返回：status=${SceneRunStatus.toString(view.status)}"))
    }

  private def awaitStructuredCall(model: SlowTextModel, timeout: FiniteDuration = 5.seconds): IO[Unit] =
    val interval = 10.millis
    val maxAttempts = (timeout.toMillis / interval.toMillis).toInt
    def loop(remaining: Int): IO[Unit] =
      IO(model.structuredCalls.get()).flatMap { calls =>
        if calls >= 1 then IO.unit
        else if remaining <= 0 then IO.raiseError(new IllegalStateException("等待题面模型调用开始超时"))
        else IO.sleep(interval) *> IO.defer(loop(remaining - 1))
      }
    loop(maxAttempts)

  private def awaitNoActiveJob(timeout: FiniteDuration = 5.seconds): IO[Unit] =
    val interval = 25.millis
    val maxAttempts = (timeout.toMillis / interval.toMillis).toInt
    def loop(remaining: Int): IO[Unit] =
      SceneJobs.activeCount.flatMap { active =>
        if active == 0 then IO.unit
        else if remaining <= 0 then IO.raiseError(new IllegalStateException(s"仍有活跃生成 fiber：$active 个"))
        else IO.sleep(interval) *> IO.defer(loop(remaining - 1))
      }
    loop(maxAttempts)