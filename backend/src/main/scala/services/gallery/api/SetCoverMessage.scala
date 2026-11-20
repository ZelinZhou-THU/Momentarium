package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.{CoverKind, ExhibitionGroup, ExhibitionId, ExhibitionPhoto, PhotoId}
import services.gallery.objects.apiTypes.CoverView
import services.gallery.tables.{ExhibitionGroupTable, ExhibitionPhotoTable, ExhibitionTable}
import services.gallery.utils.{CoverRenderFiles, CoverViews, CurrentTime, PhotoStorage, PhotoThumbnails}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ValidationReason}
import services.system.db.Transaction
import services.system.startup.AppRuntime
import services.users.objects.UserId

/** 设置封面：auto/photo 取草稿照片，render 引用本展览已上传的场景渲染封面（api-contract §2.1/§5.3）。 */
final case class SetCoverMessage(
  userId: UserId,
  exhibitionId: ExhibitionId,
  kind: CoverKind,
  photoId: Option[PhotoId],
  renderKey: Option[String]
) extends APIWithTokenMessage[CoverView]:
  override def plan(connection: Connection): IO[CoverView] =
    Transaction(connection) {
      for
        _ <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
        groups <- ExhibitionGroupTable.listByExhibition(connection, exhibitionId)
        photos <- ExhibitionPhotoTable.listByExhibition(connection, exhibitionId)
        selected <- selectedPhoto(photos)
        rendered <- renderedCover
        now <- CurrentTime.now
        _ <- rendered match
               case Some(cover) =>
                 ExhibitionTable.updateRenderCover(
                   connection,
                   exhibitionId,
                   userId,
                   cover.storageKey,
                   cover.mimeType,
                   cover.width,
                   cover.height,
                   now
                 )
               case None =>
                 ExhibitionTable.updateCover(
                   connection,
                   exhibitionId,
                   userId,
                   kind,
                   selected.map(_.id),
                   selected.flatMap(_.width),
                   selected.flatMap(_.height),
                   now
                 )
      yield coverResponse(groups, photos, selected, rendered)
    }

  private def selectedPhoto(photos: List[ExhibitionPhoto]): IO[Option[ExhibitionPhoto]] =
    kind match
      case CoverKind.Auto => IO.pure(None)
      case CoverKind.Photo =>
        photoId match
          case None => IO.raiseError(SetCoverMessage.invalidCover)
          case Some(id) =>
            photos.find(_.id == id) match
              case Some(photo) => IO.pure(Some(photo))
              case None => IO.raiseError(SetCoverMessage.invalidCover)
      case CoverKind.Render => IO.pure(None)

  private def renderedCover: IO[Option[SetCoverMessage.RenderedCover]] =
    kind match
      case CoverKind.Render =>
        renderKey match
          case None => IO.raiseError(SetCoverMessage.invalidCover)
          case Some(raw) =>
            for
              dataDirectory <- AppRuntime.config.map(_.dataDir)
              located <- CoverRenderFiles.locate(dataDirectory, exhibitionId, raw)
              rendered <- located match
                            case None => IO.raiseError(SetCoverMessage.invalidCover)
                            case Some((storageKey, format)) =>
                              for
                                bytes <- PhotoStorage.read(dataDirectory, storageKey)
                                size <- PhotoThumbnails.dimensions(bytes).flatMap {
                                          case Some(value) => IO.pure(value)
                                          case None => IO.raiseError(SetCoverMessage.invalidCover)
                                        }
                              yield Some(SetCoverMessage.RenderedCover(storageKey, format.mimeType, size._1, size._2))
            yield rendered
      case _ => IO.pure(None)

  private def coverResponse(
    groups: List[ExhibitionGroup],
    photos: List[ExhibitionPhoto],
    selected: Option[ExhibitionPhoto],
    rendered: Option[SetCoverMessage.RenderedCover]
  ): CoverView =
    kind match
      case CoverKind.Auto => CoverViews.autoCover(exhibitionId, groups, photos)
      case CoverKind.Photo =>
        selected match
          case Some(photo) => CoverViews.photoCover(exhibitionId, CoverKind.Photo, photo)
          case None => CoverViews.autoCover(exhibitionId, groups, photos)
      case CoverKind.Render =>
        rendered match
          case Some(cover) => CoverViews.renderCover(exhibitionId, cover.width, cover.height)
          case None => CoverViews.autoCover(exhibitionId, groups, photos)

object SetCoverMessage:
  private val invalidCover =
    ApiException(ApiError.validation(ValidationReason.InvalidCover, "封面不可用：照片不属于该展览，或渲染封面尚未上传"))

  private final case class RenderedCover(storageKey: String, mimeType: String, width: Int, height: Int)
