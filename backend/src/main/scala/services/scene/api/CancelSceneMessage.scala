package services.scene.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*
import org.slf4j.LoggerFactory

import services.gallery.tables.ExhibitionTable
import services.scene.objects.{SceneRun, SceneRunId, SceneRunStatus}
import services.scene.objects.apiTypes.SceneRunView
import services.scene.tables.SceneRunTable
import services.scene.utils.{CurrentTime, SceneJobs, SceneRunViews}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ErrorCode}
import services.users.objects.UserId

/**
 * cancelscene（spec §9.6 取消语义）：仅非终态可取消。
 *
 * - 条件更新把运行原子置 cancelled（queued/generating/awaiting_capture/reviewing 都可取消）；
 * - 若该运行有活跃生成/修复 fiber，取出并取消（onCancel 再条件写 cancelled，幂等）；
 * - AwaitingCapture/Queued 没有活跃 fiber 时直接置 cancelled；
 * - 终态（succeeded/failed/cancelled）→ CONFLICT；取消后不再发起评审/修复调用。
 */
final case class CancelSceneMessage(
  userId: UserId,
  runId: SceneRunId
) extends APIWithTokenMessage[SceneRunView]:

  private val logger = LoggerFactory.getLogger(getClass)

  override def plan(connection: Connection): IO[SceneRunView] =
    for
      existing <- requireOwnedRun(connection)
      _ <- rejectTerminal(existing)
      now <- CurrentTime.now
      cancelled <- SceneRunTable.cancelNonTerminal(connection, runId, now)
      _ <- if cancelled == 0 then conflict("场景运行已结束，不能取消") else IO.unit
      fiber <- SceneJobs.take(runId)
      _ <- fiber.traverse_(active => active.cancel.start.void)
      current <- requireOwnedRun(connection)
      exhibition <- ExhibitionTable.findById(connection, current.exhibitionId)
    yield SceneRunViews.view(current, isCurrent = exhibition.exists(_.currentSceneRunId.contains(current.id)))

  private def requireOwnedRun(connection: Connection): IO[SceneRun] =
    SceneRunTable.findById(connection, runId).flatMap {
      case Some(run) if run.requestedBy == userId => IO.pure(run)
      case _ => IO.raiseError(ApiException(ApiError.notFound("场景运行不存在")))
    }

  private def rejectTerminal(run: SceneRun): IO[Unit] =
    run.status match
      case SceneRunStatus.Succeeded => conflict("场景已生成成功，不能取消")
      case SceneRunStatus.Failed => conflict("场景已失败，不能取消")
      case SceneRunStatus.Cancelled => conflict("场景已取消")
      case _ => IO.unit

  private def conflict(message: String): IO[Nothing] =
    IO(logger.warn(s"cancelscene 冲突：runId=${runId.value}，$message")) *>
      IO.raiseError(ApiException(ApiError(ErrorCode.Conflict, message, None)))
