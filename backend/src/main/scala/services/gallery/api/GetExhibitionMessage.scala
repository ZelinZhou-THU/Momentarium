package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.ExhibitionId
import services.gallery.objects.apiTypes.ExhibitionDetail
import services.gallery.tables.{
  ContributionTable,
  ExhibitionGroupTable,
  ExhibitionPhotoTable,
  ExhibitionTable,
  PhotoLocationTable,
  PhotoMemoryTable,
  PublicationTable
}
import services.gallery.utils.{CurrentSceneRuns, ExhibitionViews}
import services.scene.tables.SceneRunTable
import services.system.api.APIWithTokenMessage
import services.users.objects.UserId

/**
 * 读取展览详情：章节、未分组照片、最新运行（sceneRun，用于进度/候选）与当前采用场景
 * （currentSceneRun，指针）显式分开；sceneStale/配色/未发布修改按当前指针计算。
 * 不存在或非本人一律 404。
 */
final case class GetExhibitionMessage(userId: UserId, exhibitionId: ExhibitionId)
    extends APIWithTokenMessage[ExhibitionDetail]:
  override def plan(connection: Connection): IO[ExhibitionDetail] =
    for
      exhibition <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
      groups <- ExhibitionGroupTable.listByExhibition(connection, exhibition.id)
      photos <- ExhibitionPhotoTable.listByExhibition(connection, exhibition.id)
      latestRun <- SceneRunTable.findLatestByExhibition(connection, exhibitionId)
      currentRun <- CurrentSceneRuns.load(connection, exhibition)
      activePublication <- PublicationTable.findActive(connection, exhibitionId)
      locations <- PhotoLocationTable.listByExhibition(connection, exhibitionId)
      memories <- PhotoMemoryTable.listByPhotoIds(connection, photos.map(_.id))
      pendingCounts <- ContributionTable.countPendingReviewByExhibitions(connection, List(exhibition.id))
    yield ExhibitionViews.detail(
      exhibition,
      groups,
      photos,
      latestRun,
      currentRun,
      activePublication,
      locations,
      memories,
      pendingContributionCount = pendingCounts.getOrElse(exhibition.id, 0)
    )
