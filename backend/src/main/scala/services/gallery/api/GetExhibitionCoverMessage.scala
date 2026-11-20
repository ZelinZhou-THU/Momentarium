package services.gallery.api

import java.nio.file.Path
import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.{CoverKind, Exhibition, ExhibitionId, PhotoContent}
import services.gallery.tables.{ExhibitionGroupTable, ExhibitionPhotoTable, ExhibitionTable, PublicationTable}
import services.gallery.utils.{CoverViews, PhotoStorage, PublicationViews}
import services.system.api.{APIMessage, ApiError, ApiException}
import services.users.objects.UserId

/** 读取展览封面字节（契约 §5.4）：作者读草稿封面；匿名/非作者仅当存在 active 快照时读快照封面。 */
final case class GetExhibitionCoverMessage(
  userId: Option[UserId],
  exhibitionId: ExhibitionId,
  dataDirectory: Path
) extends APIMessage[PhotoContent]:
  override def plan(connection: Connection): IO[PhotoContent] =
    for
      exhibition <- ExhibitionTable.findById(connection, exhibitionId).flatMap {
                      case Some(value) => IO.pure(value)
                      case None => IO.raiseError(noCover)
                    }
      content <- if userId.contains(exhibition.ownerId) then draftCover(connection, exhibition)
                 else publicCoverContent(connection)
    yield content

  private def draftCover(connection: Connection, exhibition: Exhibition): IO[PhotoContent] =
    for
      groups <- ExhibitionGroupTable.listByExhibition(connection, exhibitionId)
      photos <- ExhibitionPhotoTable.listByExhibition(connection, exhibitionId)
      content <- exhibition.coverKind match
                   case CoverKind.Render =>
                     exhibition.coverStorageKey match
                       case Some(storageKey) =>
                         PhotoStorage
                           .read(dataDirectory, storageKey)
                           .map(bytes => PhotoContent(bytes, exhibition.coverMime.getOrElse("image/jpeg")))
                       case None => IO.raiseError(noCover)
                   case _ =>
                     CoverViews.resolvedPhoto(exhibition, groups, photos) match
                       case Some(photo) =>
                         PhotoStorage.read(dataDirectory, photo.storageKey).map(bytes => PhotoContent(bytes, photo.mime))
                       case None => IO.raiseError(noCover)
    yield content

  private def publicCoverContent(connection: Connection): IO[PhotoContent] =
    PublicationTable.findActive(connection, exhibitionId).flatMap {
      case Some(publication) => PublicationViews.publicCoverContent(connection, publication, dataDirectory)
      case None => IO.raiseError(userId.fold(unauthorized)(_ => noCover))
    }

  private val noCover: ApiException = ApiException(ApiError.notFound("展览暂无封面照片"))
  private val unauthorized: ApiException = ApiException(ApiError.unauthorized("请先登录"))
