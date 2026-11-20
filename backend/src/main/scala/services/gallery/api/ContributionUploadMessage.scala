package services.gallery.api

import java.nio.file.Path
import java.sql.Connection
import java.time.Instant
import java.util.Locale

import cats.effect.IO
import cats.effect.Ref
import cats.syntax.all.*

import services.gallery.objects.*
import services.gallery.objects.apiTypes.{ContributionUploadFailure, ContributionUploadResponse}
import services.gallery.tables.{ContributionTable, ExhibitionContributorTable, ExhibitionTable}
import services.gallery.utils.*
import services.system.api.{APIMessage, ApiError, ApiException, ValidationReason}
import services.system.config.ContributionConfig
import services.system.db.Transaction
import services.users.objects.UserId

/** 投稿上传（multipart 二进制路由的业务执行单元，不注册消息路由）。
  *
  * 先鉴权与参与关系，再在写文件前拒绝 >单批上限与配额超限（400）；单文件大小/类型失败只入 failures。
  * 上传先写临时文件（由路由完成），取得展览级 advisory lock 后在同一临界区检查配额并写投稿文件、插入 draft 行；
  * 数据库失败删除已写文件。替换文件（contributionId）只允许单文件，成功后清理旧版本文件。 */
final case class ContributionUploadMessage(
  userId: UserId,
  exhibitionId: ExhibitionId,
  contributionId: Option[ContributionId],
  dataDirectory: Path,
  files: List[UploadCandidate],
  config: ContributionConfig
) extends APIMessage[ContributionUploadResponse]:
  override def plan(connection: Connection): IO[ContributionUploadResponse] =
    for
      exhibition <- ExhibitionTable.findById(connection, exhibitionId).flatMap {
                      case Some(found) => IO.pure(found)
                      case None => IO.raiseError(ContributionUploadMessage.notFound)
                    }
      _ <- IO.raiseWhen(exhibition.ownerId == userId)(ContributionUploadMessage.selfNotAllowed)
      _ <- requireActiveContributor(connection)
      _ <- contributionId match
             case None => ContributionQuota.requireBatchSize(files.size, config)
             case Some(_) =>
               IO.raiseWhen(files.size != 1)(
                 ApiException(ApiError.badRequest("替换投稿文件只允许单个文件"))
               )
      replacement <- contributionId.traverse(id => requireReplaceable(connection, id, exhibitionId))
      evaluated <- files.traverse(evaluate)
      validated = evaluated.collect { case Right(candidate) => candidate }
      validationFailures = evaluated.collect { case Left(failure) => failure }
      prepared <- validated.traverse(prepare)
      accepted = prepared.collect { case Right(candidate) => candidate }
      decodingFailures = prepared.collect { case Left(failure) => failure }
      now <- CurrentTime.now
      pending <- IO.ref(ContributionUploadMessage.UploadPending(Nil, Nil))
      contributions <- execute(connection, exhibition, replacement, accepted, now, pending)
      _ <- pending.get.flatMap(files => PhotoStorage.delete(dataDirectory, files.stale)).attempt.void
      summaries <- ContributionLookups.summaries(connection, contributions)
    yield ContributionUploadResponse(summaries, validationFailures ++ decodingFailures)

  private def execute(
    connection: Connection,
    exhibition: Exhibition,
    replacement: Option[Contribution],
    accepted: List[ContributionUploadMessage.PreparedContribution],
    now: Instant,
    pending: Ref[IO, ContributionUploadMessage.UploadPending]
  ): IO[List[Contribution]] =
    if accepted.isEmpty then IO.pure(Nil)
    else
      val transaction = Transaction(connection) {
        for
          _ <- ContributionQuota.acquireExhibitionLock(connection, exhibition.id)
          userQuota <- ContributionTable.quotaByContributor(connection, userId, exhibition.id)
          exhibitionQuota <- ContributionTable.quotaByExhibition(connection, exhibition.id)
          results <- replacement match
                       case Some(existing) =>
                         replace(connection, exhibition, existing, accepted.head, userQuota, exhibitionQuota, now, pending)
                           .map(List(_))
                       case None =>
                         create(connection, exhibition, accepted, userQuota, exhibitionQuota, now, pending)
        yield results
      }
      transaction.onError { _ =>
        pending.get.flatMap(files => PhotoStorage.delete(dataDirectory, files.written)).attempt.void
      }

  private def create(
    connection: Connection,
    exhibition: Exhibition,
    accepted: List[ContributionUploadMessage.PreparedContribution],
    userQuota: (Int, Long),
    exhibitionQuota: (Int, Long),
    now: Instant,
    pending: Ref[IO, ContributionUploadMessage.UploadPending]
  ): IO[List[Contribution]] =
    val incomingBytes = accepted.map(candidate => candidate.originalByteCount + candidate.derivedBytes).sum
    for
      _ <- ContributionQuota.requirePhotoQuota(userQuota._1, exhibitionQuota._1, accepted.size, config)
      _ <- ContributionQuota.requireBytesQuota(userQuota._2, exhibitionQuota._2, incomingBytes, config)
      created <- accepted.traverse(candidate => insertContribution(connection, exhibition, candidate, now, pending))
    yield created

  private def replace(
    connection: Connection,
    exhibition: Exhibition,
    existing: Contribution,
    candidate: ContributionUploadMessage.PreparedContribution,
    userQuota: (Int, Long),
    exhibitionQuota: (Int, Long),
    now: Instant,
    pending: Ref[IO, ContributionUploadMessage.UploadPending]
  ): IO[Contribution] =
    val oldBytes = existing.originalBytes.getOrElse(0L) + existing.derivedBytes.getOrElse(0L)
    for
      _ <- ContributionQuota.requirePhotoQuota(userQuota._1, exhibitionQuota._1, 0, config)
      _ <- ContributionQuota.requireBytesQuota(
             userQuota._2 - oldBytes,
             exhibitionQuota._2 - oldBytes,
             candidate.originalByteCount + candidate.derivedBytes,
             config
           )
      version = existing.version + 1
      originalKey = ContributionStorage.originalKey(exhibition.id, existing.id, version, candidate.format)
      thumbnailKey = ContributionStorage.thumbnailKey(exhibition.id, existing.id, version)
      displayKey = ContributionStorage.displayKey(exhibition.id, existing.id, version)
      _ <- writeTracked(pending, originalKey, candidate.originalBytes)
      _ <- writeTracked(pending, thumbnailKey, candidate.thumbnailJpeg)
      _ <- writeTracked(pending, displayKey, candidate.displayJpeg)
      _ <- ContributionTable.updateFile(
             connection,
             existing.id,
             userId,
             existing.version,
             candidate.originalName,
             candidate.format.mimeType,
             candidate.width,
             candidate.height,
             originalKey,
             thumbnailKey,
             displayKey,
             candidate.originalByteCount,
             candidate.derivedBytes.toLong,
             now
           )
      _ <- pending.update(files =>
             files.copy(stale =
               files.stale ++ List(existing.originalKey, existing.thumbKey, existing.displayKey).flatten
             )
           )
      updated <- ContributionTable.findById(connection, existing.id).flatMap {
                   case Some(found) => IO.pure(found)
                   case None => IO.raiseError(ContributionUploadMessage.notFound)
                 }
    yield updated

  private def insertContribution(
    connection: Connection,
    exhibition: Exhibition,
    candidate: ContributionUploadMessage.PreparedContribution,
    now: Instant,
    pending: Ref[IO, ContributionUploadMessage.UploadPending]
  ): IO[Contribution] =
    for
      contributionId <- IO.randomUUID.map(ContributionId.apply)
      originalKey = ContributionStorage.originalKey(exhibition.id, contributionId, 1, candidate.format)
      thumbnailKey = ContributionStorage.thumbnailKey(exhibition.id, contributionId, 1)
      displayKey = ContributionStorage.displayKey(exhibition.id, contributionId, 1)
      _ <- writeTracked(pending, originalKey, candidate.originalBytes)
      _ <- writeTracked(pending, thumbnailKey, candidate.thumbnailJpeg)
      _ <- writeTracked(pending, displayKey, candidate.displayJpeg)
      contribution = Contribution(
                       id = contributionId,
                       exhibitionId = exhibition.id,
                       contributorId = userId,
                       status = ContributionStatus.Draft,
                       version = 1,
                       memoryText = "",
                       suggestedCaption = None,
                       originalName = Some(candidate.originalName),
                       mime = Some(candidate.format.mimeType),
                       width = candidate.width,
                       height = candidate.height,
                       originalKey = Some(originalKey),
                       thumbKey = Some(thumbnailKey),
                       displayKey = Some(displayKey),
                       originalBytes = Some(candidate.originalByteCount),
                       derivedBytes = Some(candidate.derivedBytes.toLong),
                       locationName = "",
                       latitude = candidate.gps.map(_.latitude),
                       longitude = candidate.gps.map(_.longitude),
                       locationSource =
                         if candidate.gps.isDefined then LocationSource.Exif else ContributionLocations.contributorSource,
                       createdAt = now,
                       updatedAt = now,
                       withdrawnAt = None,
                       declinedAt = None
                     )
      _ <- ContributionTable.insert(connection, contribution)
    yield contribution

  private def requireActiveContributor(connection: Connection): IO[Unit] =
    ExhibitionContributorTable.find(connection, exhibitionId, userId).flatMap {
      case Some(contributor) if contributor.status == ContributorStatus.Active => IO.unit
      case Some(_) =>
        IO.raiseError(ApiException(ApiError.conflict(services.system.api.ConflictReason.ParticipantRevoked, "参与关系已被撤销")))
      case None => IO.raiseError(ContributionUploadMessage.notFound)
    }

  private def requireReplaceable(
    connection: Connection,
    id: ContributionId,
    exhibitionId: ExhibitionId
  ): IO[Contribution] =
    ContributionTable.findById(connection, id).flatMap {
      case Some(contribution)
          if contribution.exhibitionId == exhibitionId && contribution.contributorId == userId =>
        if contribution.status == ContributionStatus.Withdrawn then
          IO.raiseError(
            ApiException(
              ApiError.conflict(services.system.api.ConflictReason.ContributionWithdrawn, "投稿已撤回")
            )
          )
        else IO.pure(contribution)
      case _ => IO.raiseError(ContributionUploadMessage.notFound)
    }

  private def evaluate(
    candidate: UploadCandidate
  ): IO[Either[ContributionUploadFailure, ContributionUploadMessage.ValidatedCandidate]] =
    for
      fileSize <- PhotoStorage.fileSize(candidate.temporaryPath)
      prefix <- PhotoStorage.readPrefix(candidate.temporaryPath, PhotoFormat.ProbeLength)
    yield
      if fileSize > config.maxFileBytes then Left(failure(candidate, UploadFailureReason.TooLarge))
      else
        PhotoFormat.fromBytes(prefix) match
          case None => Left(failure(candidate, UploadFailureReason.UnsupportedType))
          case Some(format) if !contentTypeMatches(candidate.declaredContentType, format) =>
            Left(failure(candidate, UploadFailureReason.UnsupportedType))
          case Some(format) => Right(ContributionUploadMessage.ValidatedCandidate(candidate, format))

  private def prepare(
    validated: ContributionUploadMessage.ValidatedCandidate
  ): IO[Either[ContributionUploadFailure, ContributionUploadMessage.PreparedContribution]] =
    for
      bytes <- PhotoStorage.readTemporaryFile(validated.candidate.temporaryPath)
      processed <- PhotoThumbnails.process(bytes)
    yield processed match
      case None => Left(failure(validated.candidate, UploadFailureReason.UnsupportedType))
      case Some(image) =>
        Right(
          ContributionUploadMessage.PreparedContribution(
            originalName = originalName(validated.candidate, validated.format),
            format = validated.format,
            originalBytes = bytes,
            originalByteCount = bytes.length.toLong,
            thumbnailJpeg = image.thumbnailJpeg,
            displayJpeg = image.displayJpeg,
            width = Some(image.width),
            height = Some(image.height),
            derivedBytes = image.thumbnailJpeg.length.toLong + image.displayJpeg.length.toLong,
            gps = PhotoThumbnails.exifGps(bytes)
          )
        )

  private def writeTracked(
    pending: Ref[IO, ContributionUploadMessage.UploadPending],
    key: String,
    bytes: Array[Byte]
  ): IO[Unit] =
    PhotoStorage.write(dataDirectory, key, bytes) *>
      pending.update(files => files.copy(written = files.written :+ key))

  private def contentTypeMatches(declaredContentType: Option[String], format: PhotoFormat): Boolean =
    declaredContentType.map(_.trim.toLowerCase(Locale.ROOT).takeWhile(_ != ';').trim) match
      case None => true
      case Some(mimeType) => mimeType == format.mimeType || mimeType == "application/octet-stream"

  private def originalName(candidate: UploadCandidate, format: PhotoFormat): String =
    val baseName = candidate.fileName.replace('\\', '/').split('/').lastOption.getOrElse("")
    val cleanedName = baseName.filter(character => !character.isControl).trim
    if cleanedName.nonEmpty then cleanedName else s"photo.${format.fileExtension}"

  private def failure(candidate: UploadCandidate, reason: UploadFailureReason): ContributionUploadFailure =
    ContributionUploadFailure(candidate.fileName, reason)

object ContributionUploadMessage:
  private[gallery] final case class UploadPending(written: List[String], stale: List[String])

  private final case class ValidatedCandidate(candidate: UploadCandidate, format: PhotoFormat)

  private final case class PreparedContribution(
    originalName: String,
    format: PhotoFormat,
    originalBytes: Array[Byte],
    originalByteCount: Long,
    thumbnailJpeg: Array[Byte],
    displayJpeg: Array[Byte],
    width: Option[Int],
    height: Option[Int],
    derivedBytes: Long,
    gps: Option[GpsCoordinates]
  )

  private val notFound: ApiException = ApiException(ApiError.notFound("展览或投稿不存在"))
  private val selfNotAllowed: ApiException =
    ApiException(ApiError.validation(ValidationReason.ContributionSelfNotAllowed, "创建者不能投稿自己的展览"))
