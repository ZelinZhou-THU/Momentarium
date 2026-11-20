package services.gallery.utils

import services.gallery.objects.{
  Exhibition,
  ExhibitionGroup,
  ExhibitionPhoto,
  PhotoId,
  PhotoLocation,
  PhotoMemory,
  Publication
}
import services.gallery.objects.apiTypes.{
  ExhibitionDetail,
  ExhibitionSummary,
  GroupView,
  PhotoMemoryView
}
import services.scene.objects.{SceneRun, SceneRunId}
import services.scene.objects.apiTypes.SceneRunView

/**
 * 展览行到前端视图的装配；sceneStale、草稿配色、发布状态与 hasUnpublishedChanges 均由 gallery
 * 读取真实数据后计算。v1.14 起「当前场景」只依据 gallery.exhibitions.current_scene_run_id 指针，
 * 最新运行（任意状态）仅用于进度/候选展示。
 */
private[gallery] object ExhibitionViews:
  def summary(
    exhibition: Exhibition,
    groups: List[ExhibitionGroup],
    photos: List[ExhibitionPhoto],
    currentRun: Option[SceneRun],
    activePublication: Option[Publication],
    locations: List[PhotoLocation] = Nil,
    memories: List[PhotoMemory] = Nil,
    pendingContributionCount: Int = 0
  ): ExhibitionSummary =
    ExhibitionSummary(
      id = exhibition.id,
      title = exhibition.title,
      photoCount = photos.count(_.archivedAt.isEmpty),
      updatedAt = exhibition.updatedAt,
      cover = CoverViews.coverOf(exhibition, groups, photos),
      sceneStale = isSceneStale(exhibition, photos, currentRun),
      publication = activePublication.map(PublicationViews.summary),
      hasUnpublishedChanges = PublicationViews.hasUnpublishedChanges(
        exhibition,
        groups,
        photos,
        currentRun,
        activePublication,
        locations,
        memories
      ),
      pendingContributionCount = pendingContributionCount,
      scenePalette = scenePalette(currentRun)
    )

  def detail(
    exhibition: Exhibition,
    groups: List[ExhibitionGroup],
    photos: List[ExhibitionPhoto],
    latestRun: Option[SceneRun],
    currentRun: Option[SceneRun],
    activePublication: Option[Publication],
    locations: List[PhotoLocation] = Nil,
    memories: List[PhotoMemory] = Nil,
    pendingContributionCount: Int = 0
  ): ExhibitionDetail =
    val activePhotos = photos.filter(_.archivedAt.isEmpty)
    val memoriesByPhoto = ContributionViews.memoriesByPhoto(memories)
    ExhibitionDetail(
      id = exhibition.id,
      title = exhibition.title,
      narrative = exhibition.narrative,
      updatedAt = exhibition.updatedAt,
      groups = groups.sortBy(_.position).map(group => groupView(group, activePhotos, memoriesByPhoto)),
      ungroupedPhotos = activePhotos
        .filter(_.groupId.isEmpty)
        .map(photo => PhotoViews.toView(photo, memoryViews(memoriesByPhoto, photo))),
      sceneRun = sceneRunView(latestRun, exhibition.currentSceneRunId),
      sceneStale = isSceneStale(exhibition, photos, currentRun),
      cover = CoverViews.coverOf(exhibition, groups, photos),
      publication = activePublication.map(PublicationViews.summary),
      hasUnpublishedChanges = PublicationViews.hasUnpublishedChanges(
        exhibition,
        groups,
        photos,
        currentRun,
        activePublication,
        locations,
        memories
      ),
      pendingContributionCount = pendingContributionCount,
      scenePalette = scenePalette(currentRun),
      locations = PhotoLocations.views(orderedDraftPhotos(groups, photos), locations),
      currentSceneRun = sceneRunView(currentRun, exhibition.currentSceneRunId)
    )

  /** 场景题面的主色：当前采用场景（不是最新运行），没有当前场景或题面时为空，前端退回默认配色。 */
  def scenePalette(run: Option[SceneRun]): List[String] =
    run.flatMap(_.brief).map(_.palette).getOrElse(Nil)

  /** 场景运行行 → 契约 §4.1 的场景运行视图（gallery 只调用 scene 公开表方法/公开类型）。
    * isCurrent 由当前指针决定；不传指针时（纯映射测试）为 false。
    * 注意：scene.utils.SceneRunViews 有一份同字段镜像（跨服务无法复用私有 util），新增字段时两处同步。 */
  def sceneRunView(run: Option[SceneRun], currentSceneRunId: Option[SceneRunId] = None): Option[SceneRunView] =
    run.map(value => runView(value, currentSceneRunId.contains(value.id)))

  private def runView(run: SceneRun, isCurrent: Boolean): SceneRunView =
    SceneRunView(
      runId = run.id,
      exhibitionId = run.exhibitionId,
      status = run.status,
      source = run.source,
      attempts = run.attempts,
      hint = run.hint,
      photoIds = run.photoIds,
      curationVersion = run.curationVersion,
      brief = run.brief,
      code = run.code,
      review = run.review,
      errorCode = run.errorCode,
      errorMessage = run.errorMessage,
      createdAt = run.createdAt,
      updatedAt = run.updatedAt,
      kind = run.kind,
      parentRunId = run.parentRunId,
      revisionInstruction = run.revisionInstruction,
      isCurrent = isCurrent,
      dismissed = run.dismissed
    )

  /** spec §7 场景过期（v1.14：按当前指针）：无当前采用场景，或当前运行的 photoIds/curationVersion
    * 与当前草稿不一致；未采用候选不影响该判断。 */
  def isSceneStale(
    exhibition: Exhibition,
    photos: List[ExhibitionPhoto],
    currentRun: Option[SceneRun]
  ): Boolean =
    currentRun match
      case None => true
      case Some(run) =>
        val draftPhotoIds = photos.filter(_.archivedAt.isEmpty).map(_.id).toSet
        run.photoIds.toSet != draftPhotoIds || run.curationVersion != exhibition.curationVersion

  private def groupView(
    group: ExhibitionGroup,
    photos: List[ExhibitionPhoto],
    memoriesByPhoto: Map[PhotoId, List[PhotoMemory]]
  ): GroupView =
    GroupView(
      id = group.id,
      title = group.title,
      narrative = group.narrative,
      position = group.position,
      photos = photos
        .filter(_.groupId.contains(group.id))
        .sortBy(_.positionInGroup.getOrElse(Int.MaxValue))
        .map(photo => PhotoViews.toView(photo, memoryViews(memoriesByPhoto, photo)))
    )

  private def memoryViews(
    memoriesByPhoto: Map[PhotoId, List[PhotoMemory]],
    photo: ExhibitionPhoto
  ): List[PhotoMemoryView] =
    ContributionViews.photoMemoryViews(memoriesByPhoto.getOrElse(photo.id, Nil))

  /** 详情中照片的展示顺序：章节 position → 组内 positionInGroup，最后是未分组照片（位置数组也按此顺序）。 */
  private def orderedDraftPhotos(groups: List[ExhibitionGroup], photos: List[ExhibitionPhoto]): List[ExhibitionPhoto] =
    val activePhotos = photos.filter(_.archivedAt.isEmpty)
    val grouped = groups.sortBy(_.position).flatMap(group =>
      activePhotos
        .filter(_.groupId.contains(group.id))
        .sortBy(_.positionInGroup.getOrElse(Int.MaxValue))
    )
    grouped ++ activePhotos.filter(_.groupId.isEmpty)
