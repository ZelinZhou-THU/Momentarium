package services.gallery.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.{ExhibitionGroup, ExhibitionId, ExhibitionPhoto, GroupId}
import services.gallery.objects.apiTypes.{ExhibitionDetail, GroupInput}
import services.gallery.tables.{
  ContributionTable,
  ExhibitionGroupTable,
  ExhibitionPhotoTable,
  ExhibitionTable,
  PhotoLocationTable,
  PhotoMemoryTable,
  PublicationTable
}
import services.gallery.utils.{CurrentSceneRuns, CurrentTime, ExhibitionValidation, ExhibitionViews}
import services.scene.tables.SceneRunTable
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ValidationReason}
import services.system.db.Transaction
import services.users.objects.UserId

/** 整体替换策展：单事务内校验、重建章节、重排照片、递增 curation_version，返回最新详情。 */
final case class UpdateCurationMessage(
  userId: UserId,
  exhibitionId: ExhibitionId,
  title: String,
  narrative: String,
  groups: List[GroupInput]
) extends APIWithTokenMessage[ExhibitionDetail]:
  override def plan(connection: Connection): IO[ExhibitionDetail] =
    Transaction(connection) {
      for
        exhibition <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
        validTitle <- ExhibitionValidation.requireTitle(title)
        photos <- ExhibitionPhotoTable.listByExhibition(connection, exhibitionId)
        _ <- validate(photos)
        now <- CurrentTime.now
        _ <- ExhibitionTable.updateCuration(connection, exhibitionId, userId, validTitle, narrative, now)
        _ <- ExhibitionGroupTable.deleteByExhibition(connection, exhibitionId)
        _ <- writeGroups(connection)
        updatedExhibition <- ExhibitionTable.findById(connection, exhibitionId).flatMap {
                               case Some(found) => IO.pure(found)
                               case None => IO.raiseError(UpdateCurationMessage.exhibitionVanished)
                             }
        updatedGroups <- ExhibitionGroupTable.listByExhibition(connection, exhibitionId)
        updatedPhotos <- ExhibitionPhotoTable.listByExhibition(connection, exhibitionId)
        locations <- PhotoLocationTable.listByExhibition(connection, exhibitionId)
        memories <- PhotoMemoryTable.listByPhotoIds(connection, updatedPhotos.map(_.id))
        latestRun <- SceneRunTable.findLatestByExhibition(connection, exhibitionId)
        currentRun <- CurrentSceneRuns.load(connection, updatedExhibition)
        activePublication <- PublicationTable.findActive(connection, exhibitionId)
        pendingCounts <- ContributionTable.countPendingReviewByExhibitions(connection, List(exhibitionId))
      yield ExhibitionViews.detail(
        updatedExhibition,
        updatedGroups,
        updatedPhotos,
        latestRun,
        currentRun,
        activePublication,
        locations,
        memories,
        pendingContributionCount = pendingCounts.getOrElse(exhibitionId, 0)
      )
    }

  private def validate(photos: List[ExhibitionPhoto]): IO[Unit] =
    val draftPhotos = photos.filter(_.archivedAt.isEmpty)
    val draftPhotoIds = draftPhotos.map(_.id).toSet
    val requestedPhotoIds = groups.flatMap(_.photos.map(_.photoId))
    val ungroupedPhoto = draftPhotos.find(photo => !requestedPhotoIds.contains(photo.id))
    val unknownPhoto = requestedPhotoIds.find(photoId => !draftPhotoIds.contains(photoId))
    val duplicatedPhoto = requestedPhotoIds.groupBy(identity).collectFirst {
      case (photoId, occurrences) if occurrences.size > 1 => photoId
    }
    val hasEmptyGroup = groups.exists(_.photos.isEmpty)
    for
      _ <- if draftPhotos.size >= UpdateCurationMessage.MinimumPhotoCount then IO.unit
           else IO.raiseError(UpdateCurationMessage.photoCountError)
      _ <- ungroupedPhoto.fold(IO.unit)(_ => IO.raiseError(UpdateCurationMessage.photoUngroupedError))
      _ <- if hasEmptyGroup then IO.raiseError(UpdateCurationMessage.groupEmptyError) else IO.unit
      _ <- unknownPhoto.fold(IO.unit)(_ => IO.raiseError(UpdateCurationMessage.unknownPhotoError))
      _ <- duplicatedPhoto.fold(IO.unit)(_ => IO.raiseError(UpdateCurationMessage.duplicatedPhotoError))
    yield ()

  private def writeGroups(connection: Connection): IO[Unit] =
    groups.zipWithIndex.traverse_ { case (group, groupPosition) =>
      for
        groupId <- IO.randomUUID.map(GroupId.apply)
        _ <- ExhibitionGroupTable.insert(
               connection,
               ExhibitionGroup(groupId, exhibitionId, group.title, group.narrative, groupPosition)
             )
        _ <- group.photos.zipWithIndex.traverse_ { case (photo, photoPosition) =>
               ExhibitionPhotoTable.updatePlacement(
                 connection,
                 photo.photoId,
                 exhibitionId,
                 groupId,
                 photoPosition,
                 photo.caption
               )
             }
      yield ()
    }

object UpdateCurationMessage:
  private val MinimumPhotoCount = 3

  private val photoCountError =
    ApiException(ApiError.validation(ValidationReason.PhotoCount, "展览至少需要 3 张照片"))
  private val photoUngroupedError =
    ApiException(ApiError.validation(ValidationReason.PhotoUngrouped, "存在未分组的照片"))
  private val groupEmptyError =
    ApiException(ApiError.validation(ValidationReason.GroupEmpty, "存在空章节"))
  private val unknownPhotoError =
    ApiException(ApiError.notFound("策展引用的照片不存在或不可见"))
  private val duplicatedPhotoError =
    ApiException(ApiError.badRequest("同一张照片在策展中出现了多次"))
  private val exhibitionVanished =
    ApiException(ApiError.internal("策展写入后展览不可见"))
