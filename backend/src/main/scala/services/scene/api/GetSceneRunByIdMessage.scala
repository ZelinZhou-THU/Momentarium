package services.scene.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.tables.ExhibitionTable
import services.scene.objects.SceneRunId
import services.scene.objects.apiTypes.SceneRunView
import services.scene.tables.SceneRunTable
import services.scene.utils.SceneRunViews
import services.system.api.{APIWithTokenMessage, ApiError, ApiException}
import services.users.objects.UserId

/** getscenerunbyid：读取某次运行的完整视图（含代码）；运行不存在或展览不属于本人一律 404。 */
final case class GetSceneRunByIdMessage(userId: UserId, runId: SceneRunId) extends APIWithTokenMessage[SceneRunView]:
  override def plan(connection: Connection): IO[SceneRunView] =
    for
      run <- SceneRunTable.findById(connection, runId).flatMap {
               case Some(found) => IO.pure(found)
               case None => IO.raiseError(GetSceneRunByIdMessage.notFound)
             }
      exhibition <- ExhibitionTable.requireOwned(connection, run.exhibitionId, userId)
    yield SceneRunViews.view(run, isCurrent = exhibition.currentSceneRunId.contains(run.id))

object GetSceneRunByIdMessage:
  private val notFound = ApiException(ApiError.notFound("场景运行不存在"))
