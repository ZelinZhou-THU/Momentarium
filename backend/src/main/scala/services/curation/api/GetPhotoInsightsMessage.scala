package services.curation.api

import java.sql.Connection

import cats.effect.IO

import services.curation.objects.apiTypes.{PhotoAnalysisView, PhotoInsightsResponse}
import services.curation.tables.PhotoAnalysisTable
import services.gallery.objects.ExhibitionId
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable}
import services.scene.objects.SceneRunStatus
import services.scene.tables.SceneRunTable
import services.system.api.APIWithTokenMessage
import services.users.objects.UserId

/**
 * getphotoinsights：作者读取当前草稿照片中已缓存的 AI 解读与当前采用场景的题面（v1.14：按当前指针，
 * 不是「最新成功运行」；未采用修订候选不计）。只读缓存，不触发模型调用；不存在或非本人一律 404。
 */
final case class GetPhotoInsightsMessage(userId: UserId, exhibitionId: ExhibitionId)
    extends APIWithTokenMessage[PhotoInsightsResponse]:
  override def plan(connection: Connection): IO[PhotoInsightsResponse] =
    for
      exhibition <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
      photos <- ExhibitionPhotoTable.listByExhibition(connection, exhibitionId)
      draftPhotoIds = photos.filter(_.archivedAt.isEmpty).map(_.id)
      records <- if draftPhotoIds.isEmpty then IO.pure(Nil) else PhotoAnalysisTable.findByIds(connection, draftPhotoIds)
      currentRun <- loadCurrentRun(connection, exhibition)
    yield PhotoInsightsResponse(
      analyses = records.map(record => PhotoAnalysisView(record.photoId, record.analysis, record.model, record.analyzedAt)),
      latestBrief = currentRun.flatMap(_.brief)
    )

  /** 当前采用场景按 gallery 的 current_scene_run_id 指针读取（v1.14）；只调用 scene 公开表方法，
    * 指针行必须属于同一展览且 succeeded，否则视为无当前场景（不做“最新成功”兜底）。
    * 与 gallery.utils.CurrentSceneRuns.isValid 同口径（跨服务不能复用 gallery 私有 util）。 */
  private def loadCurrentRun(
    connection: Connection,
    exhibition: services.gallery.objects.Exhibition
  ): IO[Option[services.scene.objects.SceneRun]] =
    exhibition.currentSceneRunId match
      case None => IO.pure(None)
      case Some(runId) =>
        SceneRunTable.findById(connection, runId).map(
          _.filter(run => run.exhibitionId == exhibition.id && run.status == SceneRunStatus.Succeeded)
        )
