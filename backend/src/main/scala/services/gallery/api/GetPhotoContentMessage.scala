package services.gallery.api

import java.nio.file.Path
import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.{ExhibitionId, ExhibitionPhoto, PhotoContent, PhotoId, PhotoVariant}
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable, PublicationTable}
import services.gallery.utils.{PhotoStorage, PhotoThumbnails, PublicationViews}
import services.system.api.{APIMessage, ApiError, ApiException}
import services.users.objects.UserId

/** 读取照片内容（二进制路由的执行单元，不注册消息路由）。
  *
  * 作者可读任意状态（不依赖发布表），大图读取私有原图；匿名/非作者仅当照片被 active 发布快照引用
  * （含已归档照片）可读（D6 口径），大图始终读取去元数据展示副本，副本缺失返回 INTERNAL 不可用而不回退原图。
  */
final case class GetPhotoContentMessage(
  userId: Option[UserId],
  photoId: PhotoId,
  variant: PhotoVariant,
  dataDirectory: Path
) extends APIMessage[PhotoContent]:
  override def plan(connection: Connection): IO[PhotoContent] =
    for
      photo <- ExhibitionPhotoTable.findById(connection, photoId).flatMap {
                 case Some(found) => IO.pure(found)
                 case None => IO.raiseError(GetPhotoContentMessage.notFound)
               }
      isOwner <- isOwnerOf(connection, photo.exhibitionId)
      _ <- if isOwner then IO.unit else ensurePublished(connection, photo)
      content <- if isOwner then ownerContent(photo) else publicContent(photo)
    yield content

  private def ownerContent(photo: ExhibitionPhoto): IO[PhotoContent] =
    variant match
      case PhotoVariant.Thumb =>
        PhotoStorage
          .read(dataDirectory, photo.thumbKey)
          .map(bytes => PhotoContent(bytes, PhotoThumbnails.ThumbnailMimeType))
      case PhotoVariant.Full =>
        PhotoStorage.read(dataDirectory, photo.storageKey).map(bytes => PhotoContent(bytes, photo.mime))

  /** 公开读取：缩略图本身已是重编码产物；大图只读去元数据展示副本，缺失即不可用。 */
  private def publicContent(photo: ExhibitionPhoto): IO[PhotoContent] =
    variant match
      case PhotoVariant.Thumb =>
        PhotoStorage
          .read(dataDirectory, photo.thumbKey)
          .map(bytes => PhotoContent(bytes, PhotoThumbnails.ThumbnailMimeType))
      case PhotoVariant.Full =>
        PhotoStorage
          .readOption(dataDirectory, PhotoStorage.displayKey(photo.exhibitionId, photo.id))
          .flatMap {
            case Some(bytes) => IO.pure(PhotoContent(bytes, PhotoThumbnails.DisplayMimeType))
            case None => IO.raiseError(GetPhotoContentMessage.displayUnavailable)
          }

  private def isOwnerOf(connection: Connection, exhibitionId: ExhibitionId): IO[Boolean] =
    userId match
      case None => IO.pure(false)
      case Some(ownerId) =>
        ExhibitionTable.findById(connection, exhibitionId).map(_.exists(_.ownerId == ownerId))

  private def ensurePublished(connection: Connection, photo: ExhibitionPhoto): IO[Unit] =
    PublicationTable.findActive(connection, photo.exhibitionId).flatMap { publication =>
      val published = publication.exists(value => PublicationViews.snapshotContainsPhoto(value, photo.id))
      if published then IO.unit
      else IO.raiseError(userId.fold(GetPhotoContentMessage.unauthorized)(_ => GetPhotoContentMessage.notFound))
    }

object GetPhotoContentMessage:
  private val notFound = ApiException(ApiError.notFound("照片不存在"))
  private val unauthorized = ApiException(ApiError.unauthorized("请先登录"))
  private val displayUnavailable = ApiException(ApiError.internal("照片展示副本不可用"))

  /** 已认证调用方的便捷构造（如 curation 分析照片）：等价于带 Some(userId) 的匿名可选语义。 */
  def apply(
    userId: UserId,
    photoId: PhotoId,
    variant: PhotoVariant,
    dataDirectory: Path
  ): GetPhotoContentMessage =
    new GetPhotoContentMessage(Some(userId), photoId, variant, dataDirectory)
