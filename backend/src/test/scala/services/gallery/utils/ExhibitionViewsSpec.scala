package services.gallery.utils

import java.time.Instant
import java.util.UUID

import io.circe.parser.decode
import io.circe.syntax.*

import services.curation.objects.PhotoAnalysis
import services.gallery.objects.{
  CoverKind,
  Exhibition,
  ExhibitionGroup,
  ExhibitionId,
  ExhibitionPhoto,
  GroupId,
  PhotoId,
  Publication,
  PublicationId,
  PublicationSnapshot,
  PublicationStatus,
  SnapshotPhotoReading
}
import services.gallery.objects.apiTypes.PublicPhotoReading
import services.scene.objects.{SceneBrief, SceneReview, SceneRun, SceneRunId, SceneRunStatus, SceneSource, ReviewVerdict, RubricScores}
import services.users.objects.UserId

class ExhibitionViewsSpec extends munit.FunSuite:
  private val now = Instant.parse("2026-10-27T10:00:00Z")
  private val ownerId = UserId(UUID.randomUUID())

  test("无 succeeded run → sceneStale=true") {
    val exhibition = exhibitionOf(1)
    val photos = List(photoOf(exhibition.id))
    assert(ExhibitionViews.isSceneStale(exhibition, photos, None))
  }

  test("run 的照片集合与 curationVersion 都一致 → sceneStale=false（顺序无关）") {
    val exhibition = exhibitionOf(3)
    val photos = List(photoOf(exhibition.id), photoOf(exhibition.id))
    val run = runOf(exhibition, photos.map(_.id).reverse, curationVersion = 3)
    assertEquals(ExhibitionViews.isSceneStale(exhibition, photos, Some(run)), false)
  }

  test("run 的照片集合与草稿不同 → sceneStale=true") {
    val exhibition = exhibitionOf(1)
    val photos = List(photoOf(exhibition.id), photoOf(exhibition.id))
    val run = runOf(exhibition, photos.take(1).map(_.id), curationVersion = 1)
    assert(ExhibitionViews.isSceneStale(exhibition, photos, Some(run)))
  }

  test("run 的 curationVersion 落后 → sceneStale=true") {
    val exhibition = exhibitionOf(2)
    val photos = List(photoOf(exhibition.id), photoOf(exhibition.id))
    val run = runOf(exhibition, photos.map(_.id), curationVersion = 1)
    assert(ExhibitionViews.isSceneStale(exhibition, photos, Some(run)))
  }

  test("归档照片不计入草稿照片集合") {
    val exhibition = exhibitionOf(1)
    val active = photoOf(exhibition.id)
    val archived = photoOf(exhibition.id, archived = true)
    val run = runOf(exhibition, List(active.id), curationVersion = 1)
    assertEquals(ExhibitionViews.isSceneStale(exhibition, List(active, archived), Some(run)), false)
  }

  test("无 run → ExhibitionDetail.sceneRun=null") {
    val exhibition = exhibitionOf(1)
    val photos = List(photoOf(exhibition.id))
    val detail = ExhibitionViews.detail(exhibition, Nil, photos, latestRun = None, currentRun = None, activePublication = None)
    assertEquals(detail.sceneRun, None)
    assertEquals(detail.asJson.hcursor.get[Option[String]]("sceneRun").toOption.flatten, None)
    assertEquals(ExhibitionViews.sceneRunView(None), None)
  }

  test("awaiting_capture run → sceneRun 字段映射正确（brief/review 的 Option 与 ISO 时间）") {
    val exhibition = exhibitionOf(1)
    val photos = List(photoOf(exhibition.id))
    val run = runOf(exhibition, photos.map(_.id), curationVersion = 1).copy(
      status = SceneRunStatus.AwaitingCapture,
      source = Some(SceneSource.Ai),
      hint = Some("黄昏海边"),
      brief = Some(sampleBrief),
      review = None,
      errorCode = Some("MODEL_TIMEOUT"),
      errorMessage = Some("超时"),
      updatedAt = Instant.parse("2026-10-27T11:22:33Z")
    )
    val view = ExhibitionViews.sceneRunView(Some(run)).get
    assertEquals(view.runId, run.id)
    assertEquals(view.exhibitionId, exhibition.id)
    assertEquals(view.status, SceneRunStatus.AwaitingCapture)
    assertEquals(view.source, Some(SceneSource.Ai))
    assertEquals(view.hint, Some("黄昏海边"))
    assertEquals(view.photoIds, photos.map(_.id))
    assertEquals(view.curationVersion, 1)
    assertEquals(view.brief, Some(sampleBrief))
    assertEquals(view.review, None)
    assertEquals(view.errorCode, Some("MODEL_TIMEOUT"))
    assertEquals(view.errorMessage, Some("超时"))
    assertEquals(view.updatedAt, Instant.parse("2026-10-27T11:22:33Z"))
    val json = view.asJson.noSpaces
    assert(json.contains("\"review\":null"), "review 应显式序列化为 null")
    assert(json.contains("\"brief\":{"), "brief 应为对象")
    assert(json.contains("\"status\":\"awaiting_capture\""), "status 应为小写")
    assert(json.contains("\"source\":\"ai\""), "source 应为小写")
    assert(json.contains("\"updatedAt\":\"2026-10-27T11:22:33Z\""), "时间应为 ISO-8601 UTC")
  }

  test("succeeded run 的 review 映射，且与 sceneStale=false 共存") {
    val exhibition = exhibitionOf(2)
    val photos = List(photoOf(exhibition.id), photoOf(exhibition.id))
    val review = SceneReview(RubricScores(4, 4, 3, 4, 5), ReviewVerdict.Pass, List("构图可再收紧"), "整体通过")
    val run = runOf(exhibition, photos.map(_.id), curationVersion = 2).copy(review = Some(review))
    val detail = ExhibitionViews.detail(
      exhibition,
      Nil,
      photos,
      latestRun = Some(run),
      currentRun = Some(run),
      activePublication = None
    )
    assertEquals(detail.sceneRun.map(_.status), Some(SceneRunStatus.Succeeded))
    assertEquals(detail.sceneRun.flatMap(_.review), Some(review))
    assertEquals(detail.sceneStale, false)
    assert(detail.asJson.noSpaces.contains("\"runId\":\"" + run.id.value.toString + "\""), "detail 应包含真实 runId")
  }

  test("v1.14：currentSceneRun=当前指针、sceneRun=最新运行；isCurrent 只比较指针、配色取当前") {
    val exhibition = exhibitionOf(1)
    val photos = List(photoOf(exhibition.id))
    val parent = runOf(exhibition, photos.map(_.id), curationVersion = 1).copy(brief = Some(sampleBrief))
    val candidate = runOf(exhibition, photos.map(_.id), curationVersion = 1).copy(
      kind = services.scene.objects.SceneRunKind.Revise,
      parentRunId = Some(parent.id)
    )
    val withPointer = exhibition.copy(currentSceneRunId = Some(parent.id))
    val detail = ExhibitionViews.detail(
      withPointer,
      Nil,
      photos,
      latestRun = Some(candidate),
      currentRun = Some(parent),
      activePublication = None
    )
    assertEquals(detail.currentSceneRun.map(_.runId), Some(parent.id))
    assertEquals(detail.currentSceneRun.map(_.isCurrent), Some(true))
    assertEquals(detail.sceneRun.map(_.runId), Some(candidate.id))
    assertEquals(detail.sceneRun.map(_.isCurrent), Some(false))
    assertEquals(detail.sceneRun.map(_.kind), Some(services.scene.objects.SceneRunKind.Revise))
    assertEquals(detail.scenePalette, sampleBrief.palette, "草稿配色取当前指针")
    assertEquals(detail.sceneStale, false, "未采用候选不影响 sceneStale")
    // 无指针时 currentSceneRun=null，且 sceneRun 的 isCurrent=false。
    val withoutPointer = ExhibitionViews.detail(
      exhibition,
      Nil,
      photos,
      latestRun = Some(candidate),
      currentRun = None,
      activePublication = None
    )
    assertEquals(withoutPointer.currentSceneRun, None)
    assertEquals(withoutPointer.sceneRun.map(_.isCurrent), Some(false))
    assertEquals(withoutPointer.sceneStale, true)
  }

  test("scenePalette 取当前采用场景题面的主色；没有当前场景或题面时为空") {
    val exhibition = exhibitionOf(1)
    val photos = List(photoOf(exhibition.id))
    val run = runOf(exhibition, photos.map(_.id), curationVersion = 1)
    val withBrief = run.copy(brief = Some(sampleBrief))
    def detailWith(currentRun: Option[SceneRun]) =
      ExhibitionViews.detail(exhibition, Nil, photos, currentRun, currentRun, activePublication = None)
    assertEquals(detailWith(Some(withBrief)).scenePalette, sampleBrief.palette)
    assertEquals(detailWith(Some(run)).scenePalette, Nil)
    assertEquals(detailWith(None).scenePalette, Nil)
    assertEquals(ExhibitionViews.summary(exhibition, Nil, photos, Some(withBrief), None).scenePalette, sampleBrief.palette)
  }

  test("发布快照冻结照片 AI 解读与场景主色，公开视图逐字段转出；没有分析缓存的照片解读为空") {
    val exhibition = exhibitionOf(1)
    val group = ExhibitionGroup(GroupId(UUID.randomUUID()), exhibition.id, "退潮", "", 0)
    val analysed = photoOf(exhibition.id).copy(groupId = Some(group.id), positionInGroup = Some(0))
    val plain = photoOf(exhibition.id).copy(groupId = Some(group.id), positionInGroup = Some(1))
    val run = runOf(exhibition, List(analysed.id, plain.id), curationVersion = 1).copy(brief = Some(sampleBrief))
    val analysis = PhotoAnalysis("黄昏的海", "怀念", List("#1B2A4A", "#F2A65A"), List("潮声"), "咸湿的风", "浪把黄昏揉碎在黑石上")
    val snapshot =
      PublicationViews.snapshot(exhibition, List(group), List(analysed, plain), run, Map(analysed.id -> analysis), Nil, Nil, 1, now)
    assertEquals(snapshot.scenePalette, Some(sampleBrief.palette))
    assertEquals(
      snapshot.photos.map(_.reading),
      List(Some(SnapshotPhotoReading(List("#1B2A4A", "#F2A65A"), "浪把黄昏揉碎在黑石上", "咸湿的风")), None)
    )
    val view = PublicationViews.publicView(publicationOf(exhibition.id, snapshot), author = None)
    assertEquals(view.scenePalette, sampleBrief.palette)
    assertEquals(
      view.photos.map(_.reading),
      List(Some(PublicPhotoReading(List("#1B2A4A", "#F2A65A"), "浪把黄昏揉碎在黑石上", "咸湿的风")), None)
    )
    assertEquals(PublicationViews.authorCard(publicationOf(exhibition.id, snapshot)).scenePalette, sampleBrief.palette)
  }

  test("v0.9.8 之前的快照（没有 reading 与 scenePalette）仍能解码，公开视图解读为空、主色为空列表") {
    val exhibition = exhibitionOf(1)
    val group = ExhibitionGroup(GroupId(UUID.randomUUID()), exhibition.id, "退潮", "", 0)
    val photo = photoOf(exhibition.id).copy(groupId = Some(group.id), positionInGroup = Some(0))
    val run = runOf(exhibition, List(photo.id), curationVersion = 1)
    val current = PublicationViews.snapshot(exhibition, List(group), List(photo), run, Map.empty, Nil, Nil, 1, now)
    // 旧快照的 JSON 根本没有这两个键：去掉所有 null 字段即得到同形状的旧数据。
    val legacyJson = current.copy(scenePalette = None, locations = None).asJson.deepDropNullValues.noSpaces
    assert(!legacyJson.contains("scenePalette") && !legacyJson.contains("reading") && !legacyJson.contains("locations"))
    val legacy = decode[PublicationSnapshot](legacyJson)
    assertEquals(legacy.map(_.scenePalette), Right(None))
    assertEquals(legacy.map(_.locations), Right(None))
    assertEquals(legacy.map(_.photos.map(_.reading)), Right(List(None)))
    val view = PublicationViews.publicView(publicationOf(exhibition.id, legacy.toOption.get), author = None)
    assertEquals(view.scenePalette, Nil)
    assertEquals(view.locations, Nil)
    assertEquals(view.photos.map(_.reading), List(None))
  }

  test("v1.9 之前的快照（没有 memories）仍能解码，公开视图讲述为空数组") {
    val exhibition = exhibitionOf(1)
    val group = ExhibitionGroup(GroupId(UUID.randomUUID()), exhibition.id, "退潮", "", 0)
    val photo = photoOf(exhibition.id).copy(groupId = Some(group.id), positionInGroup = Some(0))
    val run = runOf(exhibition, List(photo.id), curationVersion = 1)
    val current = PublicationViews.snapshot(exhibition, List(group), List(photo), run, Map.empty, Nil, Nil, 1, now)
    val legacySnapshot =
      current.copy(photos = current.photos.map(_.copy(memories = None)))
    val legacyJson = legacySnapshot.asJson.deepDropNullValues.noSpaces
    assert(!legacyJson.contains("memories"))
    val legacy = decode[PublicationSnapshot](legacyJson)
    assertEquals(legacy.map(_.photos.map(_.memories)), Right(List(None)))
    val view = PublicationViews.publicView(publicationOf(exhibition.id, legacy.toOption.get), author = None)
    assertEquals(view.photos.map(_.memories), List(Nil))
  }

  private val sampleBrief: SceneBrief =
    SceneBrief(
      mood = "安静的眷恋",
      memoryReading = "海边的光。",
      scenePrompt = "用 Three.js 生成场景。",
      entranceNarration = "沿着微弱的光走进这些照片。",
      palette = List("#0B1020", "#F2A65A"),
      avoid = List("空场景"),
      userHint = Some("黄昏海边")
    )

  private def exhibitionOf(curationVersion: Int): Exhibition =
    Exhibition(
      id = ExhibitionId(UUID.randomUUID()),
      ownerId = ownerId,
      title = "济州",
      narrative = "",
      curationVersion = curationVersion,
      coverKind = CoverKind.Auto,
      coverPhotoId = None,
      coverStorageKey = None,
      coverMime = None,
      coverWidth = None,
      coverHeight = None,
      createdAt = now,
      updatedAt = now
    )

  private def photoOf(exhibitionId: ExhibitionId, archived: Boolean = false): ExhibitionPhoto =
    ExhibitionPhoto(
      id = PhotoId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      storageKey = s"${exhibitionId.value}/${UUID.randomUUID()}.jpg",
      thumbKey = s"${exhibitionId.value}/${UUID.randomUUID()}.thumb.jpg",
      originalName = "jeju.jpg",
      mime = "image/jpeg",
      width = Some(1600),
      height = Some(1067),
      groupId = None,
      positionInGroup = None,
      caption = "",
      archivedAt = if archived then Some(now) else None,
      createdAt = now
    )

  private def runOf(exhibition: Exhibition, photoIds: List[PhotoId], curationVersion: Int): SceneRun =
    SceneRun(
      id = SceneRunId(UUID.randomUUID()),
      exhibitionId = exhibition.id,
      requestedBy = ownerId,
      status = SceneRunStatus.Succeeded,
      source = Some(SceneSource.Ai),
      hint = None,
      photoIds = photoIds,
      curationVersion = curationVersion,
      runtimeVersion = "1",
      brief = None,
      code = Some("function build(ctx) {}"),
      review = None,
      runtimeEvidence = None,
      attempts = 0,
      promptVersion = "test-v1",
      errorCode = None,
      errorMessage = None,
      createdAt = now,
      updatedAt = now
    )

  private def publicationOf(exhibitionId: ExhibitionId, snapshot: PublicationSnapshot): Publication =
    Publication(
      id = PublicationId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      version = snapshot.version,
      snapshot = snapshot,
      status = PublicationStatus.Active,
      createdAt = now,
      supersededAt = None
    )
