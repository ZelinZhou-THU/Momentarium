package services.scene.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.tables.ExhibitionTable
import services.scene.objects.{SceneRun, SceneRunKind, SceneRunId, SceneRunStatus}
import services.scene.objects.apiTypes.SceneRunView
import services.scene.tables.SceneRunTable
import services.scene.utils.{CurrentTime, SceneContract, SceneRunViews, SceneState}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ConflictReason}
import services.system.db.Transaction
import services.users.objects.UserId

/**
 * acceptscenerun（api-contract v1.14 §4.2 / spec §10.6）：把修订候选设为当前采用场景。
 *
 * 校验：作者 → 运行 succeeded 且 kind=revise（409 SCENE_RUN_NOT_ACCEPTABLE）→
 * 父运行仍是当前指针、照片集合/curationVersion/运行时仍匹配（409 SCENE_REVISION_STALE）；
 * 同一修订已是当前时幂等返回。指针写入经 gallery.ExhibitionTable 公开方法，
 * 校验与写入在同一连接事务内完成。采用只改草稿指针：公开页仍读 active 快照，需重新发布。
 */
final case class AcceptSceneRunMessage(
  userId: UserId,
  runId: SceneRunId
) extends APIWithTokenMessage[SceneRunView]:

  override def plan(connection: Connection): IO[SceneRunView] =
    Transaction(connection) {
      for
        run <- SceneRunTable.findByIdForUpdate(connection, runId).flatMap {
                 case Some(found) => IO.pure(found)
                 case None => IO.raiseError(AcceptSceneRunMessage.notFound)
               }
        exhibition <- ExhibitionTable.requireOwned(connection, run.exhibitionId, userId)
        _ <- IO.raiseUnless(isAcceptableShape(run))(AcceptSceneRunMessage.notAcceptable)
        view <-
          if exhibition.currentSceneRunId.contains(run.id) then
            IO.pure(SceneRunViews.view(run, isCurrent = true))
          else accept(connection, run, exhibition)
      yield view
    }

  private def accept(
    connection: Connection,
    run: SceneRun,
    exhibition: services.gallery.objects.Exhibition
  ): IO[SceneRunView] =
    for
      parentRunId <- run.parentRunId match
                       case Some(parentId) => IO.pure(parentId)
                       case None => IO.raiseError(AcceptSceneRunMessage.notAcceptable)
      _ <- IO.raiseUnless(exhibition.currentSceneRunId.contains(parentRunId))(
             AcceptSceneRunMessage.revisionStale
           )
      state <- SceneState.load(connection, exhibition)
      _ <- IO.raiseUnless(run.photoIds.toSet == state.photoIds)(AcceptSceneRunMessage.revisionStale)
      _ <- IO.raiseUnless(run.curationVersion == exhibition.curationVersion)(
             AcceptSceneRunMessage.revisionStale
           )
      _ <- IO.raiseUnless(run.runtimeVersion == SceneContract.RuntimeVersion)(
             AcceptSceneRunMessage.revisionStale
           )
      now <- CurrentTime.now
      _ <- ExhibitionTable
             .setCurrentSceneRun(connection, exhibition.id, run.id, now)
             .void
    yield SceneRunViews.view(run, isCurrent = true)

  /** 采用资格的形状部分：修订候选 + 成功 + 有代码（父指针与素材匹配由后续校验）。 */
  private def isAcceptableShape(run: SceneRun): Boolean =
    run.kind == SceneRunKind.Revise &&
      run.status == SceneRunStatus.Succeeded &&
      !run.dismissed &&
      run.code.exists(_.trim.nonEmpty)

object AcceptSceneRunMessage:
  private val notFound = ApiException(ApiError.notFound("场景运行不存在"))
  private val notAcceptable = ApiException(
    ApiError.conflict(ConflictReason.SceneRunNotAcceptable, "只有成功生成的修订候选可以设为当前场景")
  )
  private val revisionStale = ApiException(
    ApiError.conflict(ConflictReason.SceneRevisionStale, "父版本或素材已过期，请刷新后重新修订并采用")
  )
