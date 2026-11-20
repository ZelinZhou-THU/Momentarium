package services.scene.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.ExhibitionId
import services.gallery.tables.ExhibitionTable
import services.scene.objects.apiTypes.SceneRunView
import services.scene.tables.SceneRunTable
import services.scene.utils.SceneRunViews
import services.system.api.{APIWithTokenMessage, ApiError, ApiException}
import services.users.objects.UserId

/** getscenerun：作者读取该展览最新一次场景运行（前端 2s 轮询）。 */
final case class GetSceneRunMessage(
  userId: UserId,
  exhibitionId: ExhibitionId
) extends APIWithTokenMessage[SceneRunView]:

  override def plan(connection: Connection): IO[SceneRunView] =
    for
      exhibition <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
      run <- SceneRunTable.findLatestByExhibition(connection, exhibitionId).flatMap {
               case Some(found) => IO.pure(found)
               case None => IO.raiseError(ApiException(ApiError.notFound("还没有场景运行")))
             }
    yield SceneRunViews.view(run, isCurrent = exhibition.currentSceneRunId.contains(run.id))
