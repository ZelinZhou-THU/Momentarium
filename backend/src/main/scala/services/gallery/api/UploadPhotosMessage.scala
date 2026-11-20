package services.gallery.api

import java.nio.file.Path
import java.sql.Connection
import java.time.Instant
import java.util.Locale

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.*
import services.gallery.objects.apiTypes.{PhotoView, UploadFailure, UploadPhotosResponse}
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable, PhotoLocationTable}
import services.gallery.utils.{PhotoStorage, PhotoThumbnails, PhotoViews}
import services.system.api.{APIMessage, ApiError, ApiException, ValidationReason}
import services.system.db.Transaction
import services.users.objects.UserId

/** 上传照片：multipart 二进制路由的业务执行单元（不注册消息路由，由 PhotoRoutes 构造并调用 plan）。
  *
  * 所有文件先流式落到临时文件；本消息逐个读取（内存中同时只有一个文件），单文件失败只入 failures，
  * 通过校验的照片写入 DATA_DIR 并在同一事务里落库、递增展览草稿版本。
  */
final case class UploadPhotosMessage(
  userId: UserId,
  exhibitionId: ExhibitionId,
  dataDirectory: Path,
  files: List[UploadCandidate]
) extends APIMessage[UploadPhotosResponse]:
  override def plan(connection: Connection): IO[UploadPhotosResponse] =
    for
      _ <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
      existingCount <- ExhibitionPhotoTable.countByExhibition(connection, exhibitionId)
      evaluated <- files.traverse(evaluate)
      validated = evaluated.collect { case Right(validatedPhoto) => validatedPhoto }
      validationFailures = evaluated.collect { case Left(failure) => failure }
      // 30 张上限口径（spec §8.4/§8.6）：现有未归档照片数 + 本批通过基础校验（大小/魔数/声明 mime）的文件数；
      // 超限整批 400 VALIDATION(PHOTO_LIMIT)，不逐文件失败。后续解码失败只会让实际入库数少于该口径，不会突破上限；
      // 单文件业务失败（UPLOAD_TOO_LARGE / UPLOAD_UNSUPPORTED_TYPE）不计入本批数量。
      _ <- ensurePhotoCapacity(existingCount, validated.size)
      now <- nowInstant
      prepared <- validated.traverse(prepare(_, now))
      accepted = prepared.collect { case Right(preparedPhoto) => preparedPhoto }
      decodingFailures = prepared.collect { case Left(failure) => failure }
      _ <- persist(connection, accepted, now)
    yield UploadPhotosResponse(accepted.map(_.view), validationFailures ++ decodingFailures)

  private def evaluate(candidate: UploadCandidate): IO[Either[UploadFailure, UploadPhotosMessage.ValidatedPhoto]] =
    for
      fileSize <- PhotoStorage.fileSize(candidate.temporaryPath)
      prefix <- PhotoStorage.readPrefix(candidate.temporaryPath, PhotoFormat.ProbeLength)
    yield
      if fileSize > UploadPhotosMessage.MaxFileBytes then Left(failure(candidate, UploadFailureReason.TooLarge))
      else
        PhotoFormat.fromBytes(prefix) match
          case None => Left(failure(candidate, UploadFailureReason.UnsupportedType))
          case Some(format) if !contentTypeMatches(candidate.declaredContentType, format) =>
            Left(failure(candidate, UploadFailureReason.UnsupportedType))
          case Some(format) => Right(UploadPhotosMessage.ValidatedPhoto(candidate, format))

  private def prepare(
    validated: UploadPhotosMessage.ValidatedPhoto,
    now: Instant
  ): IO[Either[UploadFailure, UploadPhotosMessage.PreparedPhoto]] =
    for
      bytes <- PhotoStorage.readTemporaryFile(validated.candidate.temporaryPath)
      processed <- PhotoThumbnails.process(bytes)
      result <- processed match
                 case None => IO.pure(Left(failure(validated.candidate, UploadFailureReason.UnsupportedType)))
                 case Some(image) => store(validated, bytes, image, now).map(Right(_))
    yield result

  private def store(
    validated: UploadPhotosMessage.ValidatedPhoto,
    originalBytes: Array[Byte],
    image: PhotoThumbnails.ProcessedImage,
    now: Instant
  ): IO[UploadPhotosMessage.PreparedPhoto] =
    for
      photoId <- IO.randomUUID.map(PhotoId.apply)
      // 上传时只在本地解析 JPEG APP1 EXIF GPS 作为 suggested 建议；不调用任何外部反向地理编码。
      // PNG/WebP 不产生建议（阶段 1 已知限制）。
      gps = PhotoThumbnails.exifGps(originalBytes)
      storageKey = PhotoStorage.originalKey(exhibitionId, photoId, validated.format)
      thumbnailKey = PhotoStorage.thumbnailKey(exhibitionId, photoId)
      displayKey = PhotoStorage.displayKey(exhibitionId, photoId)
      photo = ExhibitionPhoto(
        id = photoId,
        exhibitionId = exhibitionId,
        storageKey = storageKey,
        thumbKey = thumbnailKey,
        originalName = originalName(validated.candidate, validated.format),
        mime = validated.format.mimeType,
        width = Some(image.width),
        height = Some(image.height),
        groupId = None,
        positionInGroup = None,
        caption = "",
        archivedAt = None,
        createdAt = now
      )
      _ <- PhotoStorage.write(dataDirectory, storageKey, originalBytes)
      _ <- PhotoStorage.write(dataDirectory, thumbnailKey, image.thumbnailJpeg)
      // 公开读取只走展示副本：方向纠正后重编码为 JPEG，EXIF/GPS 等元数据在重新编码时丢失。
      _ <- PhotoStorage.write(dataDirectory, displayKey, image.displayJpeg)
    yield UploadPhotosMessage.PreparedPhoto(photo, PhotoViews.toView(photo), gps)

  private def persist(
    connection: Connection,
    photos: List[UploadPhotosMessage.PreparedPhoto],
    now: Instant
  ): IO[Unit] =
    if photos.isEmpty then IO.unit
    else
      Transaction(connection) {
        photos.traverse_(preparedPhoto =>
          ExhibitionPhotoTable.insert(connection, preparedPhoto.photo) *>
            preparedPhoto.gps.traverse_(gps =>
              // 建议只写坐标与 hidden 粒度，name 为空：未确认建议不进入公开快照。
              PhotoLocationTable.upsert(
                connection,
                PhotoLocation(
                  photoId = preparedPhoto.photo.id,
                  source = LocationSource.Exif,
                  status = LocationStatus.Suggested,
                  name = "",
                  latitude = Some(gps.latitude),
                  longitude = Some(gps.longitude),
                  granularity = LocationGranularity.Hidden,
                  updatedAt = now
                )
              )
            )
        ) *>
          ExhibitionTable.touchDraft(connection, exhibitionId, now)
      }.attempt.flatMap {
        case Right(_) => IO.unit
        case Left(error) =>
          val storedKeys = photos.flatMap(preparedPhoto =>
            List(
              preparedPhoto.photo.storageKey,
              preparedPhoto.photo.thumbKey,
              PhotoStorage.displayKey(preparedPhoto.photo.exhibitionId, preparedPhoto.photo.id)
            )
          )
          PhotoStorage.delete(dataDirectory, storedKeys).attempt.void *> IO.raiseError(error)
      }

  private def ensurePhotoCapacity(existingCount: Int, incomingCount: Int): IO[Unit] =
    if existingCount + incomingCount <= UploadPhotosMessage.MaxPhotosPerExhibition then IO.unit
    else
      IO.raiseError(
        ApiException(
          ApiError.validation(
            ValidationReason.PhotoLimit,
            s"每个展览最多 ${UploadPhotosMessage.MaxPhotosPerExhibition} 张照片"
          )
        )
      )

  private def contentTypeMatches(declaredContentType: Option[String], format: PhotoFormat): Boolean =
    declaredContentType.map(_.trim.toLowerCase(Locale.ROOT).takeWhile(_ != ';').trim) match
      case None => true
      case Some(mimeType) => mimeType == format.mimeType || mimeType == "application/octet-stream"

  private def originalName(candidate: UploadCandidate, format: PhotoFormat): String =
    val baseName = candidate.fileName.replace('\\', '/').split('/').lastOption.getOrElse("")
    val cleanedName = baseName.filter(character => !character.isControl).trim
    if cleanedName.nonEmpty then cleanedName else s"photo.${format.fileExtension}"

  private def failure(candidate: UploadCandidate, reason: UploadFailureReason): UploadFailure =
    UploadFailure(candidate.fileName, reason)

  private def nowInstant: IO[Instant] =
    IO.realTime.map(duration => Instant.ofEpochMilli(duration.toMillis))

object UploadPhotosMessage:
  /** 单文件上限 15MB（spec §8.4）。 */
  val MaxFileBytes: Long = 15L * 1024 * 1024

  /** 单展览照片上限 30 张（spec §8.4）。 */
  val MaxPhotosPerExhibition: Int = 30

  private final case class ValidatedPhoto(candidate: UploadCandidate, format: PhotoFormat)

  private final case class PreparedPhoto(photo: ExhibitionPhoto, view: PhotoView, gps: Option[GpsCoordinates])
