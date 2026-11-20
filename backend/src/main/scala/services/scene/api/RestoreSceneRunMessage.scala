package services.scene.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.tables.ExhibitionTable
import services.scene.objects.SceneRunId
import services.scene.objects.apiTypes.SceneRunView
import services.scene.tables.SceneRunTable
import services.scene.utils.{CurrentTime, SceneRunHistory, SceneRunViews, SceneState}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ConflictReason, ValidationReason}
import services.system.db.Transaction
import services.users.objects.UserId

/**
 * restorescenerun：把一次成功运行恢复为当前场景。实现为克隆一条新的 succeeded restore 行（素材取当前草稿），
 * 并在同一事务内把 gallery.exhibitions.current_scene_run_id 指向新克隆（v1.14）。
 * 是否已是当前、幂等判断与成功后的指针更新都依据当前指针（不再取「最新 succeeded」）；有进行中的运行时 409。
 */
final case class RestoreSceneRunMessage(userId: UserId, runId: SceneRunId) extends APIWithTokenMessage[SceneRunView]:
  override def plan(connection: Connection): IO[SceneRunView] =
    Transaction(connection) {
      for
        source <- SceneRunTable.findById(connection, runId).flatMap {
                    case Some(found) => IO.pure(found)
                    case None => IO.raiseError(RestoreSceneRunMessage.notFound)
                  }
        exhibition <- ExhibitionTable.requireOwned(connection, source.exhibitionId, userId)
        _ <- IO.raiseUnless(SceneRunHistory.restorable(source))(RestoreSceneRunMessage.notRestorable)
        active <- SceneRunTable.findActiveByExhibition(connection, exhibition.id)
        _ <- IO.raiseWhen(active.isDefined)(RestoreSceneRunMessage.runActive)
        view <-
          if exhibition.currentSceneRunId.contains(source.id) then
            IO.pure(SceneRunViews.view(source, isCurrent = true))
          else
            for
              state <- SceneState.load(connection, exhibition)
              now <- CurrentTime.now
              newId <- IO.randomUUID.map(SceneRunId.apply)
              cloned = SceneRunHistory.cloneForRestore(
                         source,
                         newId,
                         userId,
                         state.photos.map(_.id),
                         exhibition.curationVersion,
                         now
                       )
              _ <- SceneRunTable.insert(connection, cloned)
              _ <- ExhibitionTable.setCurrentSceneRun(connection, exhibition.id, cloned.id, now)
            yield SceneRunViews.view(cloned, isCurrent = true)
      yield view
    }

object RestoreSceneRunMessage:
  private val notFound = ApiException(ApiError.notFound("场景运行不存在"))
  private val notRestorable = ApiException(
    ApiError.validation(ValidationReason.SceneRunNotRestorable, "只有成功且与当前运行时兼容的场景可以恢复")
  )
  private val runActive = ApiException(
    ApiError.conflict(ConflictReason.SceneRunActive, "有场景正在生成，请等它结束或停止后再恢复")
  )
