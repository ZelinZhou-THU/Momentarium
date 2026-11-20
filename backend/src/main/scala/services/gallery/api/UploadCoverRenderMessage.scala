package services.gallery.api

import java.nio.file.Path
import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.{ExhibitionId, PhotoFormat, UploadCandidate}
import services.gallery.objects.apiTypes.CoverRenderUploadResponse
import services.gallery.tables.ExhibitionTable
import services.gallery.utils.{CoverRenderFiles, PhotoStorage, PhotoThumbnails}
import services.system.api.{APIMessage, ApiError, ApiException, ValidationReason}
import services.users.objects.UserId

/** 场景渲染封面上传：非消息路由的业务执行单元（不注册消息路由，由 CoverRenderRoutes 构造调用）。
  *
  * 存储前整图重编码（JPEG/PNG）：公开输出因此不携带 EXIF/GPS/注释等元数据，同时按 EXIF Orientation 纠正方向。
  */
final case class UploadCoverRenderMessage(
  userId: UserId,
  exhibitionId: ExhibitionId,
  dataDirectory: Path,
  candidate: UploadCandidate
) extends APIMessage[CoverRenderUploadResponse]:
  override def plan(connection: Connection): IO[CoverRenderUploadResponse] =
    for
      _ <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
      fileSize <- PhotoStorage.fileSize(candidate.temporaryPath)
      _ <- IO.raiseWhen(fileSize > CoverRenderFiles.MaxCoverBytes)(UploadCoverRenderMessage.tooLarge)
      prefix <- PhotoStorage.readPrefix(candidate.temporaryPath, PhotoFormat.ProbeLength)
      format <- PhotoFormat.fromBytes(prefix).filter(CoverRenderFiles.isAllowedFormat) match
                  case Some(value) => IO.pure(value)
                  case None => IO.raiseError(UploadCoverRenderMessage.unsupportedType)
      bytes <- PhotoStorage.readTemporaryFile(candidate.temporaryPath)
      sanitized <- PhotoThumbnails.sanitize(bytes, format).flatMap {
                     case Some(value) => IO.pure(value)
                     case None => IO.raiseError(UploadCoverRenderMessage.unsupportedType)
                   }
      _ <- IO.raiseWhen(math.max(sanitized.width, sanitized.height) > CoverRenderFiles.MaxCoverLongEdge)(
             UploadCoverRenderMessage.tooLarge
           )
      renderKey <- IO.randomUUID
      storageKey = CoverRenderFiles.storageKey(exhibitionId, renderKey, format)
      _ <- PhotoStorage.write(dataDirectory, storageKey, sanitized.bytes)
    yield CoverRenderUploadResponse(renderKey.toString, sanitized.width, sanitized.height)

object UploadCoverRenderMessage:
  private val tooLarge =
    ApiException(ApiError.validation(ValidationReason.CoverTooLarge, "渲染封面不能超过 4MB 或长边 2048"))
  private val unsupportedType =
    ApiException(ApiError.validation(ValidationReason.CoverUnsupportedType, "渲染封面仅支持 JPEG/PNG"))
