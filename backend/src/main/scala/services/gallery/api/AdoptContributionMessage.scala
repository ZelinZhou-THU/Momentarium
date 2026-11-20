package services.gallery.api

import java.nio.file.Path
import java.sql.Connection
import java.time.Instant
import java.util.Arrays

import cats.effect.IO
import cats.effect.Ref
import cats.syntax.all.*

import services.gallery.objects.*
import services.gallery.objects.apiTypes.{AdoptedLocationInput, ContributionAdoptionView}
import services.gallery.tables.*
import services.gallery.utils.*
import services.system.api.*
import services.system.db.Transaction
import services.system.startup.AppRuntime
import services.users.objects.UserId
import services.users.tables.{ProfileTable, UserTable}
import services.gallery.utils.PhotoLocations.LocationInput

/** adoptcontribution（v1.12）：创建者按版本采用投稿，只把投稿源复制为新的草稿照片。
  *
  * 采用在单事务内核对版本并写讲述；首次采用后目标锁定（photo_memories.contribution_id 唯一）。
  * 同一投稿的新版本再次采用同一目标时原地更新：文件变化才替换草稿照片文件并 touchDraft，
  * 回忆文字变化也 touchDraft（讲述是 AI 输入，v0.15.0），仅位置/图注变化时只 touchUpdatedAt；无照片投稿不能采用（400 CONTRIBUTION_PHOTO_REQUIRED）。
  * 文件复制与数据库写入分开补偿：数据库失败删除已写文件。
  *
  * v1.15：groupId 可选，仅首次采用（新建照片）生效——新照片放进该章节末尾；章节不属于本展览返回 404；
  * 原地更新忽略 groupId，不移动已有照片。 */
final case class AdoptContributionMessage(
  userId: UserId,
  contributionId: ContributionId,
  expectedVersion: Int,
  caption: Option[String],
  location: Option[AdoptedLocationInput],
  groupId: Option[GroupId] = None
) extends APIWithTokenMessage[ContributionAdoptionView]:
  override def plan(connection: Connection): IO[ContributionAdoptionView] =
    for
      dataDirectory <- AppRuntime.config.map(_.dataDir)
      pending <- IO.ref(AdoptContributionMessage.PendingFiles(Nil, Nil))
      result <- Transaction(connection)(adopt(connection, dataDirectory, pending)).onError { _ =>
                  pending.get.flatMap(files => PhotoStorage.delete(dataDirectory, files.written)).attempt.void
                }
      _ <- pending.get.flatMap(files => PhotoStorage.delete(dataDirectory, files.stale)).attempt.void
    yield result

  private def adopt(
    connection: Connection,
    dataDirectory: Path,
    pending: Ref[IO, AdoptContributionMessage.PendingFiles]
  ): IO[ContributionAdoptionView] =
    for
      contribution <- ContributionAccess.requireContribution(connection, contributionId)
      exhibition <- ExhibitionTable.requireOwned(connection, contribution.exhibitionId, userId)
      submitted <- ContributionAccess.requireAdoptable(contribution)
      _ <- requireActiveParticipant(connection, submitted)
      _ <- IO.raiseWhen(expectedVersion != submitted.version)(AdoptContributionMessage.versionConflict)
      adoption <- PhotoMemoryTable.findByContributionId(connection, submitted.id)
      result <- adoption match
                  case Some(memory) if memory.adoptedVersion == expectedVersion =>
                    IO.pure(ContributionViews.adoptionView(memory))
                  case Some(memory) if memory.adoptedVersion > expectedVersion =>
                    IO.raiseError(AdoptContributionMessage.versionConflict)
                  case Some(memory) => updateInPlace(connection, dataDirectory, exhibition, submitted, memory, pending)
                  case None => firstAdoption(connection, dataDirectory, exhibition, submitted, pending)
    yield result

  private def firstAdoption(
    connection: Connection,
    dataDirectory: Path,
    exhibition: Exhibition,
    contribution: Contribution,
    pending: Ref[IO, AdoptContributionMessage.PendingFiles]
  ): IO[ContributionAdoptionView] =
    // v1.12 只允许“新建照片”；历史纯文字/无图投稿不能采用。
    if ContributionViews.hasPhoto(contribution) then
      adoptNewPhoto(connection, dataDirectory, exhibition, contribution, pending)
    else IO.raiseError(AdoptContributionMessage.photoRequired)

  /** 新建草稿照片：把投稿源复制为草稿独立文件，按 creator 确认的位置/图注写入。 */
  private def adoptNewPhoto(
    connection: Connection,
    dataDirectory: Path,
    exhibition: Exhibition,
    contribution: Contribution,
    pending: Ref[IO, AdoptContributionMessage.PendingFiles]
  ): IO[ContributionAdoptionView] =
    for
      _ <- ensurePhotoCapacity(connection, exhibition.id)
      placement <- resolvePlacement(connection, exhibition.id)
      locationInput <- location.traverse(toLocationInput)
      resolvedCaption <- resolveCaption(contribution)
      contributorName <- displayNameOf(connection, contribution.contributorId)
      now <- CurrentTime.now
      photoId <- IO.randomUUID.map(PhotoId.apply)
      format = contribution.mime.flatMap(PhotoFormat.fromMimeType).getOrElse(PhotoFormat.Jpeg)
      originalKey = PhotoStorage.originalKey(exhibition.id, photoId, format)
      thumbnailKey = PhotoStorage.thumbnailKey(exhibition.id, photoId)
      displayKey = PhotoStorage.displayKey(exhibition.id, photoId)
      source <- readContributionFiles(dataDirectory, contribution)
      _ <- writeTracked(dataDirectory, pending, originalKey, source.original)
      _ <- writeTracked(dataDirectory, pending, thumbnailKey, source.thumbnail)
      _ <- writeTracked(dataDirectory, pending, displayKey, source.display)
      photo = ExhibitionPhoto(
                id = photoId,
                exhibitionId = exhibition.id,
                storageKey = originalKey,
                thumbKey = thumbnailKey,
                originalName = contribution.originalName.getOrElse(s"contributor-photo.${format.fileExtension}"),
                mime = contribution.mime.getOrElse(format.mimeType),
                width = contribution.width,
                height = contribution.height,
                groupId = placement.map(_.groupId),
                positionInGroup = placement.map(_.position),
                caption = resolvedCaption,
                archivedAt = None,
                createdAt = now,
                adoptedFromContributionId = Some(contribution.id)
              )
      _ <- ExhibitionPhotoTable.insert(connection, photo)
      _ <- locationInput.traverse_(input => upsertConfirmedLocation(connection, photoId, input, now))
      memory <- insertMemory(connection, photoId, contribution, contributorName, now)
      _ <- ExhibitionTable.touchDraft(connection, exhibition.id, now)
    yield ContributionViews.adoptionView(memory)

  /** v1.15：请求带 groupId 时，新照片放进该章节末尾（章节必须属于本展览）；缺省则不放章节（未分组）。 */
  private def resolvePlacement(
    connection: Connection,
    exhibitionId: ExhibitionId
  ): IO[Option[AdoptContributionMessage.Placement]] =
    groupId.traverse { requestedGroupId =>
      for
        groups <- ExhibitionGroupTable.listByExhibition(connection, exhibitionId)
        _ <- IO.raiseUnless(groups.exists(_.id == requestedGroupId))(AdoptContributionMessage.groupNotFound)
        photos <- ExhibitionPhotoTable.listByExhibition(connection, exhibitionId)
        nextPosition = photos
                         .filter(photo => photo.archivedAt.isEmpty && photo.groupId.contains(requestedGroupId))
                         .flatMap(_.positionInGroup)
                         .maxOption
                         .fold(0)(_ + 1)
      yield AdoptContributionMessage.Placement(requestedGroupId, nextPosition)
    }

  /** 同一稿件新版本再次采用：目标锁定在已存在讲述的照片上；新建照片目标按文件变化原地更新。 */
  private def updateInPlace(
    connection: Connection,
    dataDirectory: Path,
    exhibition: Exhibition,
    contribution: Contribution,
    memory: PhotoMemory,
    pending: Ref[IO, AdoptContributionMessage.PendingFiles]
  ): IO[ContributionAdoptionView] =
    for
      photo <- requireTargetPhoto(connection, exhibition.id, memory.photoId)
      contributorName <- displayNameOf(connection, contribution.contributorId)
      now <- CurrentTime.now
      _ <- PhotoMemoryTable.update(connection, memory.id, contribution.memoryText, contributorName, contribution.version, now)
      locationInput <- location.traverse(toLocationInput)
      _ <- locationInput.traverse_(input => upsertConfirmedLocation(connection, photo.id, input, now))
      validCaption <- caption.traverse(ContributionCaptions.normalizePhotoCaption)
      createdByAdoption =
        photo.adoptedFromContributionId match
          case Some(origin) => origin == contribution.id
          case None => photo.createdAt == memory.createdAt
      fileChanged <-
        if createdByAdoption && ContributionViews.hasPhoto(contribution) then
          for
            changed <- replaceDraftPhotoFiles(connection, dataDirectory, exhibition.id, photo, contribution, pending)
            _ <- validCaption.traverse_(value => updateCaption(connection, exhibition.id, photo, value))
          yield changed
        else IO.pure(false)
      // 讲述是策展与场景的 AI 输入（v0.15.0）：文字或文件变化都递增 curation_version 使场景过期；
      // 只有位置/图注类变化时仍只刷新 updated_at。
      textChanged = memory.text != contribution.memoryText
      _ <- if fileChanged || textChanged then ExhibitionTable.touchDraft(connection, exhibition.id, now)
           else ExhibitionTable.touchUpdatedAt(connection, exhibition.id, now)
    yield ContributionViews.adoptionView(memory.copy(adoptedVersion = contribution.version, updatedAt = now))

  /** 新建照片图注：显式 caption 优先（空串=清空预填值），缺失/null 回退投稿建议图注，二者都空则写空串。 */
  private def resolveCaption(contribution: Contribution): IO[String] =
    caption match
      case Some(value) => ContributionCaptions.normalizePhotoCaption(value)
      case None => IO.pure(contribution.suggestedCaption.getOrElse(""))

  /** 比较投稿当前文件与草稿照片原图字节：不同才替换文件变体；纯文字投稿不碰照片文件。返回是否变化。 */
  private def replaceDraftPhotoFiles(
    connection: Connection,
    dataDirectory: Path,
    exhibitionId: ExhibitionId,
    photo: ExhibitionPhoto,
    contribution: Contribution,
    pending: Ref[IO, AdoptContributionMessage.PendingFiles]
  ): IO[Boolean] =
    (contribution.originalKey, contribution.mime, contribution.thumbKey, contribution.displayKey) match
      case (Some(contributionOriginalKey), Some(contributionMime), Some(contributionThumbKey), Some(contributionDisplayKey)) =>
        for
          contributionOriginal <- PhotoStorage.read(dataDirectory, contributionOriginalKey)
          draftOriginal <- PhotoStorage.readOption(dataDirectory, photo.storageKey)
          changed = !draftOriginal.exists(bytes => Arrays.equals(bytes, contributionOriginal))
          _ <-
            if !changed then IO.unit
            else
              val format = PhotoFormat.fromMimeType(contributionMime).getOrElse(PhotoFormat.Jpeg)
              val originalKey = PhotoStorage.originalKey(exhibitionId, photo.id, format)
              val thumbnailKey = PhotoStorage.thumbnailKey(exhibitionId, photo.id)
              val displayKey = PhotoStorage.displayKey(exhibitionId, photo.id)
              for
                thumbnail <- PhotoStorage.read(dataDirectory, contributionThumbKey)
                display <- PhotoStorage.read(dataDirectory, contributionDisplayKey)
                _ <- writeTracked(dataDirectory, pending, originalKey, contributionOriginal)
                _ <- writeTracked(dataDirectory, pending, thumbnailKey, thumbnail)
                _ <- writeTracked(dataDirectory, pending, displayKey, display)
                _ <- ExhibitionPhotoTable.updateFile(
                       connection,
                       photo.id,
                       exhibitionId,
                       originalKey,
                       thumbnailKey,
                       contribution.originalName.getOrElse(s"contributor-photo.${format.fileExtension}"),
                       contributionMime,
                       contribution.width,
                       contribution.height
                     )
                _ <- pending.update(files =>
                       if photo.storageKey == originalKey then files else files.copy(stale = files.stale :+ photo.storageKey)
                     )
              yield ()
        yield changed
      case _ => IO.pure(false)

  private def upsertConfirmedLocation(
    connection: Connection,
    photoId: PhotoId,
    input: LocationInput,
    now: Instant
  ): IO[Unit] =
    PhotoLocationTable.upsert(
      connection,
      PhotoLocation(
        photoId = photoId,
        source = LocationSource.Manual,
        status = LocationStatus.Confirmed,
        name = input.name,
        latitude = input.latitude,
        longitude = input.longitude,
        granularity = input.granularity,
        updatedAt = now
      )
    )

  private def insertMemory(
    connection: Connection,
    photoId: PhotoId,
    contribution: Contribution,
    contributorName: String,
    now: Instant
  ): IO[PhotoMemory] =
    IO.randomUUID.map(PhotoMemoryId.apply).flatMap { memoryId =>
      val memory = PhotoMemory(
        id = memoryId,
        photoId = photoId,
        contributionId = contribution.id,
        contributorUserId = contribution.contributorId,
        contributorName = contributorName,
        text = contribution.memoryText,
        adoptedVersion = contribution.version,
        createdAt = now,
        updatedAt = now
      )
      PhotoMemoryTable.insert(connection, memory).as(memory)
    }

  private def updateCaption(
    connection: Connection,
    exhibitionId: ExhibitionId,
    photo: ExhibitionPhoto,
    value: String
  ): IO[Unit] =
    val captionValue = value.trim
    if captionValue == photo.caption then IO.unit
    else ExhibitionPhotoTable.updateCaption(connection, photo.id, exhibitionId, captionValue)

  private def requireActiveParticipant(connection: Connection, contribution: Contribution): IO[Unit] =
    ExhibitionContributorTable.find(connection, contribution.exhibitionId, contribution.contributorId).flatMap {
      case Some(participant) if participant.status == ContributorStatus.Active => IO.unit
      case Some(_) => IO.raiseError(AdoptContributionMessage.participantRevoked)
      case None => IO.raiseError(AdoptContributionMessage.notFound)
    }

  private def requireTargetPhoto(
    connection: Connection,
    exhibitionId: ExhibitionId,
    photoId: PhotoId
  ): IO[ExhibitionPhoto] =
    ExhibitionPhotoTable.findById(connection, photoId).flatMap {
      case Some(photo) if photo.exhibitionId == exhibitionId && photo.archivedAt.isEmpty => IO.pure(photo)
      case _ => IO.raiseError(AdoptContributionMessage.notFound)
    }

  private def ensurePhotoCapacity(connection: Connection, exhibitionId: ExhibitionId): IO[Unit] =
    ExhibitionPhotoTable.countByExhibition(connection, exhibitionId).flatMap { count =>
      IO.raiseWhen(count >= UploadPhotosMessage.MaxPhotosPerExhibition)(AdoptContributionMessage.photoLimit(count))
    }

  private def displayNameOf(connection: Connection, contributorId: UserId): IO[String] =
    for
      user <- UserTable.findById(connection, contributorId).flatMap {
                case Some(found) => IO.pure(found)
                case None => IO.raiseError(AdoptContributionMessage.notFound)
              }
      profile <- ProfileTable.findByUserId(connection, contributorId)
    yield ContributionViews.displayName(user, profile)

  private def toLocationInput(input: AdoptedLocationInput): IO[LocationInput] =
    PhotoLocations.requireInput(input.name, input.latitude, input.longitude, input.granularity)

  private def readContributionFiles(
    dataDirectory: Path,
    contribution: Contribution
  ): IO[AdoptContributionMessage.ContributionFiles] =
    (contribution.originalKey, contribution.thumbKey, contribution.displayKey) match
      case (Some(originalKey), Some(thumbKey), Some(displayKey)) =>
        for
          original <- PhotoStorage.read(dataDirectory, originalKey)
          thumbnail <- PhotoStorage.read(dataDirectory, thumbKey)
          display <- PhotoStorage.read(dataDirectory, displayKey)
        yield AdoptContributionMessage.ContributionFiles(original, thumbnail, display)
      case _ => IO.raiseError(AdoptContributionMessage.photoRequired)

  private def writeTracked(
    dataDirectory: Path,
    pending: Ref[IO, AdoptContributionMessage.PendingFiles],
    key: String,
    bytes: Array[Byte]
  ): IO[Unit] =
    PhotoStorage.write(dataDirectory, key, bytes) *>
      pending.update(files => files.copy(written = files.written :+ key))

object AdoptContributionMessage:
  final case class ContributionFiles(original: Array[Byte], thumbnail: Array[Byte], display: Array[Byte])

  private final case class PendingFiles(written: List[String], stale: List[String])

  /** 新照片在章节中的落点：章节 + 章节内位置（末尾）。 */
  private final case class Placement(groupId: GroupId, position: Int)

  private val notFound: ApiException = ApiException(ApiError.notFound("投稿或采用照片不存在"))
  private val groupNotFound: ApiException = ApiException(ApiError.notFound("章节不存在"))
  private val versionConflict: ApiException =
    ApiException(ApiError.conflict(ConflictReason.ContributionVersionConflict, "投稿版本已变化，请刷新后重试"))
  private val participantRevoked: ApiException =
    ApiException(ApiError.conflict(ConflictReason.ParticipantRevoked, "参与关系已被撤销"))
  private val photoRequired: ApiException =
    ApiException(
      ApiError.validation(ValidationReason.ContributionPhotoRequired, "纯文字投稿只能关联已有照片；新建照片需要投稿附有照片")
    )

  private def photoLimit(current: Int): ApiException =
    ApiException(
      ApiError.validation(
        ValidationReason.PhotoLimit,
        s"每个展览最多 ${UploadPhotosMessage.MaxPhotosPerExhibition} 张照片（当前 $current 张）"
      )
    )
