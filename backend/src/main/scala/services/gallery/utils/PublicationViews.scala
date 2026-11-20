package services.gallery.utils

import java.time.Instant

import cats.effect.IO

import services.gallery.objects.*
import services.gallery.objects.apiTypes.*
import services.curation.objects.PhotoAnalysis
import services.gallery.tables.ExhibitionPhotoTable
import services.scene.objects.SceneRun
import services.system.api.{ApiError, ApiException}

/** 发布快照装配与公开视图：快照是唯一公开数据源，草稿不参与公开读。 */
private[gallery] object PublicationViews:
  def snapshot(
    exhibition: Exhibition,
    groups: List[ExhibitionGroup],
    photos: List[ExhibitionPhoto],
    run: SceneRun,
    analyses: Map[PhotoId, PhotoAnalysis],
    locations: List[PhotoLocation],
    memories: List[PhotoMemory],
    version: Int,
    publishedAt: Instant
  ): PublicationSnapshot =
    val activePhotos = photos.filter(_.archivedAt.isEmpty)
    val orderedGroups = groups.sortBy(_.position)
    val orderedPhotos = orderedGroups.flatMap(group =>
      activePhotos
        .filter(_.groupId.contains(group.id))
        .sortBy(_.positionInGroup.getOrElse(Int.MaxValue))
    )
    val memoriesByPhoto = ContributionViews.memoriesByPhoto(memories)
    val resolvedCoverPhoto = CoverViews.resolvedPhoto(exhibition, groups, photos)
    PublicationSnapshot(
      version = version,
      publishedAt = publishedAt,
      curationVersion = exhibition.curationVersion,
      title = exhibition.title,
      narrative = exhibition.narrative,
      narration = run.brief.map(_.entranceNarration).getOrElse(""),
      cover = snapshotCover(exhibition, resolvedCoverPhoto.map(_.id)),
      groups = orderedGroups.map { group =>
        SnapshotGroup(
          group.id,
          group.title,
          group.narrative,
          group.position,
          orderedPhotos.filter(_.groupId.contains(group.id)).map(_.id)
        )
      },
      photos = orderedPhotos.map { photo =>
        SnapshotPhoto(
          photo.id,
          photo.originalName,
          photo.mime,
          photo.width.getOrElse(0),
          photo.height.getOrElse(0),
          photo.caption,
          photo.groupId,
          photo.positionInGroup,
          analyses.get(photo.id).map(snapshotReading),
          // 冻结已采用讲述（含署名与采用顺序）：投稿后续修改不影响已发布快照。
          memories = Some(ContributionViews.snapshotMemories(memoriesByPhoto.getOrElse(photo.id, Nil)))
        )
      },
      sceneRunId = Some(run.id),
      sceneCode = run.code,
      sceneRuntimeVersion = Some(run.runtimeVersion),
      sceneGeneratedAt = Some(run.updatedAt),
      scenePalette = Some(ExhibitionViews.scenePalette(Some(run))),
      // 冻结公开位置：只含 confirmed 且非 hidden 的位置，按快照照片顺序。
      locations = Some(PhotoLocations.snapshotLocations(orderedPhotos, locations))
    )

  private def snapshotReading(analysis: PhotoAnalysis): SnapshotPhotoReading =
    SnapshotPhotoReading(analysis.palette, analysis.suggestedCaption, analysis.sensory)

  private def snapshotCover(exhibition: Exhibition, resolvedPhotoId: Option[PhotoId]): SnapshotCover =
    exhibition.coverKind match
      case CoverKind.Render =>
        SnapshotCover(
          kind = CoverKind.Render,
          photoId = None,
          renderKey = exhibition.coverStorageKey.flatMap(renderKeyOf),
          storageKey = exhibition.coverStorageKey,
          mime = exhibition.coverMime,
          width = exhibition.coverWidth.getOrElse(0),
          height = exhibition.coverHeight.getOrElse(0)
        )
      case kind =>
        SnapshotCover(
          kind = kind,
          photoId = exhibition.coverPhotoId.orElse(resolvedPhotoId),
          renderKey = None,
          storageKey = None,
          mime = None,
          width = exhibition.coverWidth.getOrElse(0),
          height = exhibition.coverHeight.getOrElse(0)
        )

  private def renderKeyOf(storageKey: String): Option[String] =
    storageKey.split('/').lastOption.map(fileName => fileName.takeWhile(character => character != '.'))

  def summary(publication: Publication): PublicationSummary =
    PublicationSummary(publication.version, publication.snapshot.publishedAt)

  def publicView(publication: Publication, author: Option[PublicAuthorView]): PublicExhibitionView =
    val snapshot = publication.snapshot
    val photosById = snapshot.photos.map(photo => photo.id -> photo).toMap
    val groups = snapshot.groups
      .sortBy(_.position)
      .map(group =>
        PublicGroupView(
          id = group.id,
          title = group.title,
          narrative = group.narrative,
          position = group.position,
          photos = group.photoIds.flatMap(photosById.get).map(publicPhoto)
        )
      )
    PublicExhibitionView(
      id = publication.exhibitionId,
      version = publication.version,
      title = snapshot.title,
      narrative = snapshot.narrative,
      narration = snapshot.narration,
      cover = publicCover(publication.exhibitionId, snapshot.cover, width = snapshot.cover.width, height = snapshot.cover.height),
      groups = groups,
      photos = snapshot.photos.map(publicPhoto),
      publishedAt = snapshot.publishedAt,
      author = author,
      scenePalette = snapshot.scenePalette.getOrElse(Nil),
      locations = PhotoLocations.publicLocations(snapshot)
    )

  /** 作者主页卡片：与公开页同一份 active 快照与封面地址。 */
  def authorCard(publication: Publication): AuthorExhibitionCard =
    val snapshot = publication.snapshot
    AuthorExhibitionCard(
      id = publication.exhibitionId,
      title = snapshot.title,
      narration = snapshot.narration,
      cover = publicCover(publication.exhibitionId, snapshot.cover, width = snapshot.cover.width, height = snapshot.cover.height),
      version = publication.version,
      publishedAt = snapshot.publishedAt,
      scenePalette = snapshot.scenePalette.getOrElse(Nil)
    )

  /** 作者主页跨展览足迹（api-contract v1.8 §2.1）：只聚合 active 快照冻结的公开位置，
    * 不读草稿或 photo_locations 实时表；展览按 publishedAt 倒序，同一展览内沿用快照 locations
    * （发布时已按快照 photos 顺序冻结）；旧快照没有 locations 时该展览不贡献条目。 */
  def journeyLocations(publications: List[Publication]): List[AuthorJourneyLocation] =
    publications
      .sortWith((left, right) => left.snapshot.publishedAt.isAfter(right.snapshot.publishedAt))
      .flatMap { publication =>
        val snapshot = publication.snapshot
        snapshot.locations.getOrElse(Nil).map { location =>
          AuthorJourneyLocation(
            exhibitionId = publication.exhibitionId,
            exhibitionTitle = snapshot.title,
            photoId = location.photoId,
            name = location.name,
            latitude = location.latitude,
            longitude = location.longitude,
            granularity = location.granularity
          )
        }
      }

  private def publicPhoto(photo: SnapshotPhoto): PublicPhotoView =
    PublicPhotoView(
      id = photo.id,
      width = photo.width,
      height = photo.height,
      caption = photo.caption,
      contentUrl = s"/api/photos/${photo.id.value}/content?variant=full",
      thumbUrl = s"/api/photos/${photo.id.value}/content?variant=thumb",
      reading = photo.reading.map(reading => PublicPhotoReading(reading.palette, reading.poeticLine, reading.sensory)),
      memories = ContributionViews.publicMemories(photo.memories)
    )

  private def publicCover(exhibitionId: ExhibitionId, cover: SnapshotCover, width: Int, height: Int): CoverView =
    CoverView(cover.kind, s"/api/exhibitions/${exhibitionId.value}/cover", width, height)

  /** hasUnpublishedChanges（api-contract §2.1 v1.14）：存在 active 且草稿的版本/标题/叙事/封面与快照不同，
    * 或**当前采用场景指针**不是快照绑定的那次运行（重新生成/恢复/采用修订后需要重新发布；
    * 只生成未采用修订候选不计入）；或公开位置投影与快照不同；
    * 或已采用讲述投影与快照不同。 */
  def hasUnpublishedChanges(
    exhibition: Exhibition,
    groups: List[ExhibitionGroup],
    photos: List[ExhibitionPhoto],
    currentRun: Option[SceneRun],
    activePublication: Option[Publication],
    locations: List[PhotoLocation] = Nil,
    memories: List[PhotoMemory] = Nil
  ): Boolean =
    activePublication.exists { publication =>
      val snapshot = publication.snapshot
      snapshot.sceneRunId != currentRun.map(_.id) ||
      snapshot.curationVersion != exhibition.curationVersion ||
      snapshot.title != exhibition.title ||
      snapshot.narrative != exhibition.narrative ||
      !coverMatches(exhibition, groups, photos, snapshot.cover) ||
      !publicLocationsMatch(snapshot, locations) ||
      !memoriesMatch(snapshot, memories)
    }

  /** 讲述投影：按快照照片顺序比较冻结的 text + contributorName 序列。 */
  private def memoriesMatch(snapshot: PublicationSnapshot, memories: List[PhotoMemory]): Boolean =
    val byPhoto = ContributionViews.memoriesByPhoto(memories)
    val current = snapshot.photos.flatMap(photo =>
      ContributionViews.snapshotMemories(byPhoto.getOrElse(photo.id, Nil))
    )
    val frozen = snapshot.photos.flatMap(_.memories.getOrElse(Nil))
    frozen == current

  private def publicLocationsMatch(snapshot: PublicationSnapshot, locations: List[PhotoLocation]): Boolean =
    PhotoLocations.projection(snapshot.photos, locations) == snapshot.locations.getOrElse(Nil)

  private def coverMatches(
    exhibition: Exhibition,
    groups: List[ExhibitionGroup],
    photos: List[ExhibitionPhoto],
    snapshotCover: SnapshotCover
  ): Boolean =
    if exhibition.coverKind != snapshotCover.kind then false
    else
      exhibition.coverKind match
        case CoverKind.Render => exhibition.coverStorageKey == snapshotCover.storageKey
        case _ => CoverViews.resolvedPhoto(exhibition, groups, photos).map(_.id) == snapshotCover.photoId

  def snapshotContainsPhoto(publication: Publication, photoId: PhotoId): Boolean =
    publication.snapshot.photos.exists(_.id == photoId)

  /** 公开读 active 快照封面（render 读冻结的无元数据文件、auto/photo 读去元数据照片展示副本，含已归档照片）。
    *
    * auto/photo 封面必须复用照片展示副本；副本缺失返回 INTERNAL 不可用，不回退原始照片字节。
    */
  def publicCoverContent(
    connection: java.sql.Connection,
    publication: Publication,
    dataDirectory: java.nio.file.Path
  ): IO[PhotoContent] =
    publication.snapshot.cover.kind match
      case CoverKind.Render =>
        publication.snapshot.cover.storageKey match
          case Some(storageKey) =>
            PhotoStorage
              .read(dataDirectory, storageKey)
              .map(bytes => PhotoContent(bytes, publication.snapshot.cover.mime.getOrElse("image/jpeg")))
          case None => IO.raiseError(noCover)
      case _ =>
        publication.snapshot.cover.photoId match
          case Some(photoId) =>
            ExhibitionPhotoTable.findById(connection, photoId).flatMap {
              case Some(photo) =>
                PhotoStorage
                  .readOption(dataDirectory, PhotoStorage.displayKey(photo.exhibitionId, photo.id))
                  .flatMap {
                    case Some(bytes) => IO.pure(PhotoContent(bytes, PhotoThumbnails.DisplayMimeType))
                    case None => IO.raiseError(displayUnavailable)
                  }
              case None => IO.raiseError(noCover)
            }
          case None => IO.raiseError(noCover)

  private val noCover: ApiException = ApiException(ApiError.notFound("展览暂无公开封面"))
  private val displayUnavailable: ApiException = ApiException(ApiError.internal("封面展示副本不可用"))
