package services.scene.api

import java.sql.Connection

import cats.effect.IO
import org.slf4j.LoggerFactory

import services.gallery.tables.ExhibitionTable
import services.scene.objects.{SceneRun, SceneRunId, SceneRunStatus}
import services.scene.objects.apiTypes.{RuntimeEvidence, SceneRunView}
import services.scene.tables.SceneRunTable
import services.scene.utils.{CurrentTime, SceneReviewFlow, SceneRunViews}
import services.system.ai.AiRuntime
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ErrorCode}
import services.system.startup.AppRuntime
import services.users.objects.UserId

/**
 * reviewscene（spec §9.5 / §9.6）：客户端回传 2 张截图与运行时证据，服务端做主观验收。
 *
 * 1. 条件更新 `WHERE id=? AND requested_by=? AND status='awaiting_capture'` → reviewing（防重复评审双花）；
 *    更新不到时按原因返回 404（不存在/越权）或 409（状态不可评审/正在评审/终态）。
 * 2. 硬门禁 + VLM 五维评分 + 阈值判定（见 SceneReviewFlow/ReviewDecision）。
 * 3. 通过 → Succeeded(source=Ai)；不通过且有额度 → attempts+1 回 Generating 并异步修复；
 *    用尽/模型异常 → FallbackScene → Succeeded(source=Fallback)，评审结果能保留则保留。
 */
final case class ReviewSceneMessage(
  userId: UserId,
  runId: SceneRunId,
  captures: List[String],
  runtime: RuntimeEvidence
) extends APIWithTokenMessage[SceneRunView]:

  private val logger = LoggerFactory.getLogger(getClass)

  override def plan(connection: Connection): IO[SceneRunView] =
    for
      now <- CurrentTime.now
      claimed <- SceneRunTable.claimForReview(connection, runId, userId, runtime, now)
      run <- if claimed > 0 then requireRun(connection) else rejectClaim(connection)
      config <- AppRuntime.config
      database <- AppRuntime.database
      ports <- AiRuntime.ports
      reviewed <- SceneReviewFlow.run(connection, database, ports, config, run, captures, runtime)
      exhibition <- ExhibitionTable.findById(connection, reviewed.exhibitionId)
    yield SceneRunViews.view(
      reviewed,
      isCurrent = exhibition.exists(_.currentSceneRunId.contains(reviewed.id))
    )

  private def requireRun(connection: Connection): IO[SceneRun] =
    SceneRunTable.findById(connection, runId).flatMap {
      case Some(run) => IO.pure(run)
      case None =>
        IO(logger.error(s"条件更新已推进但读不到运行：runId=${runId.value}")) *>
          IO.raiseError(ApiException(ApiError.internal("评审状态更新后读不到场景运行")))
    }

  /** 条件更新失败：区分「不存在/越权（404）」与「状态冲突（409）」，越权不泄露运行存在性。 */
  private def rejectClaim(connection: Connection): IO[SceneRun] =
    SceneRunTable.findById(connection, runId).flatMap {
      case None => IO.raiseError(ApiException(ApiError.notFound("场景运行不存在")))
      case Some(run) if run.requestedBy != userId =>
        IO.raiseError(ApiException(ApiError.notFound("场景运行不存在")))
      case Some(run) =>
        run.status match
          case SceneRunStatus.Reviewing =>
            conflict("该场景正在评审中，请勿重复提交")
          case SceneRunStatus.Succeeded | SceneRunStatus.Failed | SceneRunStatus.Cancelled =>
            conflict("场景运行已结束，不能重复评审")
          case _ =>
            conflict("当前状态不可评审（需要 awaiting_capture）")
    }

  private def conflict(message: String): IO[Nothing] =
    IO.raiseError(ApiException(ApiError(ErrorCode.Conflict, message, None)))
