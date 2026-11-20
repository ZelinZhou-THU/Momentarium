package services.scene.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.ExhibitionId
import services.gallery.tables.PublicationTable
import services.scene.objects.{SceneRun, SceneRunId, SceneRunStatus}
import services.scene.objects.apiTypes.PublishedSceneResponse
import services.scene.tables.SceneRunTable
import services.system.api.{APIMessage, ApiError, ApiException}

/**
 * getpublishedscene（api-contract §4.2 / spec §6.1）：公开、无令牌地读取已发布场景。
 *
 * 只信任 gallery 的 active 发布快照：快照 sceneRunId → SceneRunTable.findById →
 * 必须是 succeeded 且 code 非空、且 run 属于同一展览，才返回 code/runtimeVersion/generatedAt；
 * 无 active 快照、快照未绑定场景、run 不存在/非 succeeded/code 空 → 统一 404。
 * 绝不走 getscenerun 的草稿/作者路径，公开读不泄露未发布内容。
 */
final case class GetPublishedSceneMessage(exhibitionId: ExhibitionId) extends APIMessage[PublishedSceneResponse]:

  override def plan(connection: Connection): IO[PublishedSceneResponse] =
    for
      publication <- PublicationTable.findActive(connection, exhibitionId).flatMap {
                      case Some(found) => IO.pure(found)
                      case None => IO.raiseError(notFound)
                    }
      runId <- publication.snapshot.sceneRunId.fold(IO.raiseError[SceneRunId](notFound))(runId => IO.pure(runId))
      run <- SceneRunTable.findById(connection, runId).flatMap {
              case Some(found) => IO.pure(found)
              case None => IO.raiseError(notFound)
            }
      _ <- ensurePublishable(exhibitionId, run)
      code <- run.code.filter(_.trim.nonEmpty).fold(IO.raiseError[String](notFound))(code => IO.pure(code))
    yield PublishedSceneResponse(code = code, runtimeVersion = run.runtimeVersion, generatedAt = run.updatedAt)

  private def ensurePublishable(exhibitionId: ExhibitionId, run: SceneRun): IO[Unit] =
    for
      _ <- IO.raiseWhen(run.exhibitionId != exhibitionId)(notFound)
      _ <- IO.raiseWhen(run.status != SceneRunStatus.Succeeded)(notFound)
    yield ()

  private def notFound: ApiException = GetPublishedSceneMessage.notFound

object GetPublishedSceneMessage:
  /** 对外统一 404：无发布/快照无场景/场景不可用，均不泄露草稿与内部状态。 */
  private val notFound: ApiException = ApiException(ApiError.notFound("场景尚未发布或不可用"))
