package services.gallery.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.{PhotoId, PhotoLocation}
import services.gallery.objects.apiTypes.MyExhibitionsResponse
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
import services.system.api.{APIWithTokenMessage, NoRequestMessage}
import services.users.objects.UserId

/** 列出当前用户的全部展览（按最近修改排序，含真实 sceneStale、发布状态与公开位置投影比较）。 */
final case class ListMyExhibitionsMessage(userId: UserId)
    extends APIWithTokenMessage[MyExhibitionsResponse],
      NoRequestMessage[MyExhibitionsResponse]:
  override def plan(connection: Connection): IO[MyExhibitionsResponse] =
    ExhibitionTable.listByOwner(connection, userId).flatMap { exhibitions =>
      val exhibitionIds = exhibitions.map(_.id)
      for
        allLocations <- PhotoLocationTable.listByExhibitions(connection, exhibitionIds)
        pendingCounts <- ContributionTable.countPendingReviewByExhibitions(connection, exhibitionIds)
        summaries <- exhibitions.traverse { exhibition =>
                       for
                         groups <- ExhibitionGroupTable.listByExhibition(connection, exhibition.id)
                         photos <- ExhibitionPhotoTable.listByExhibition(connection, exhibition.id)
                         currentRun <- CurrentSceneRuns.load(connection, exhibition)
                         activePublication <- PublicationTable.findActive(connection, exhibition.id)
                         locations = locationsOf(photos.map(_.id).toSet, allLocations)
                         memories <- PhotoMemoryTable.listByPhotoIds(connection, photos.map(_.id))
                       yield ExhibitionViews.summary(
                         exhibition,
                         groups,
                         photos,
                         currentRun,
                         activePublication,
                         locations,
                         memories,
                         pendingContributionCount = pendingCounts.getOrElse(exhibition.id, 0)
                       )
                     }
      yield MyExhibitionsResponse(summaries)
    }

  private def locationsOf(photoIds: Set[PhotoId], allLocations: List[PhotoLocation]): List[PhotoLocation] =
    allLocations.filter(location => photoIds.contains(location.photoId))
