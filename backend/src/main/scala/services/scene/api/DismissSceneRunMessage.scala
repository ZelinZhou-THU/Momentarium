package services.scene.api

import java.sql.Connection
import cats.effect.IO
import services.gallery.tables.ExhibitionTable
import services.scene.objects.{SceneRunId, SceneRunKind, SceneRunStatus}
import services.scene.objects.apiTypes.SceneRunView
import services.scene.tables.SceneRunTable
import services.scene.utils.SceneRunViews
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ConflictReason}
import services.system.db.Transaction
import services.users.objects.UserId

/** 放弃成功的未采用修订候选；保留历史，但不能再次采用该运行。 */
final case class DismissSceneRunMessage(userId: UserId, runId: SceneRunId) extends APIWithTokenMessage[SceneRunView]:
  override def plan(connection: Connection): IO[SceneRunView] =
    Transaction(connection) {
      for
        run <- SceneRunTable.findByIdForUpdate(connection, runId).flatMap {
                 case Some(found) => IO.pure(found)
                 case None => IO.raiseError(ApiException(ApiError.notFound("场景运行不存在")))
               }
        exhibition <- ExhibitionTable.requireOwned(connection, run.exhibitionId, userId)
        _ <- IO.raiseUnless(
               run.kind == SceneRunKind.Revise && run.status == SceneRunStatus.Succeeded &&
                 !exhibition.currentSceneRunId.contains(run.id)
             )(ApiException(ApiError.conflict(ConflictReason.SceneRunNotAcceptable, "只能放弃未采用的修订候选")))
        _ <- SceneRunTable.dismiss(connection, run.id)
      yield SceneRunViews.view(run.copy(dismissed = true))
    }
