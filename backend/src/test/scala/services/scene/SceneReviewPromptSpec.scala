package services.scene

import java.time.Instant
import java.util.UUID

import munit.FunSuite

import services.curation.objects.PhotoAnalysis
import services.gallery.objects.*
import services.scene.objects.*
import services.scene.objects.apiTypes.RuntimeEvidence
import services.scene.utils.{ReviewDecision, SceneContract, SceneState}
import services.scene.utils.prompts.{SceneBriefPrompts, SceneCodePrompts, SceneReviewPrompts}
import services.users.objects.UserId

/**
 * 评审/修复提示词自检（spec §9.5、scene-prompt-spec §3.3）：
 * 人类策展人立场、截图区域证据、防提示词注入、只看渲染不信代码承诺、issues/summary 上限；
 * 修复提示词必须带上题面、上一版代码与逐条 issues。
 */
class SceneReviewPromptSpec extends FunSuite:

  private val now = Instant.parse("2026-10-27T12:00:00Z")
  private val exhibitionId = ExhibitionId(UUID.fromString("00000000-0000-0000-0000-000000003001"))
  private val ownerId = UserId(UUID.fromString("00000000-0000-0000-0000-000000003002"))
  private val groupId = GroupId(UUID.fromString("00000000-0000-0000-0000-000000003003"))
  private val photoA = PhotoId(UUID.fromString("00000000-0000-0000-0000-000000003005"))
  private val photoB = PhotoId(UUID.fromString("00000000-0000-0000-0000-000000003006"))

  private val exhibition = Exhibition(
    id = exhibitionId,
    ownerId = ownerId,
    title = "济州的三天",
    narrative = "从海边到山里的三天。",
    curationVersion = 1,
    coverKind = CoverKind.Auto,
    coverPhotoId = None,
    coverStorageKey = None,
    coverMime = None,
    coverWidth = None,
    coverHeight = None,
    createdAt = now,
    updatedAt = now
  )

  private val groups = List(ExhibitionGroup(groupId, exhibitionId, "海边的黄昏", "第一天的记忆", 0))

  private val photos = List(
    ExhibitionPhoto(
      photoA,
      exhibitionId,
      "ex/a.jpg",
      "ex/a.thumb.jpg",
      "a.jpg",
      "image/jpeg",
      Some(1024),
      Some(683),
      Some(groupId),
      Some(0),
      "日落时的礁石",
      None,
      now
    ),
    ExhibitionPhoto(
      photoB,
      exhibitionId,
      "ex/b.jpg",
      "ex/b.thumb.jpg",
      "b.jpg",
      "image/jpeg",
      Some(1365),
      Some(1024),
      Some(groupId),
      Some(1),
      "退潮后的盐光",
      None,
      now
    )
  )

  private val state = SceneState(exhibition, groups, photos)
  private val analyses: Map[PhotoId, PhotoAnalysis] = Map.empty

  private val brief = SceneBrief(
    mood = "安静的眷恋",
    memoryReading = "海风与退潮的礁石唤起克制的想念。",
    scenePrompt = "【任务】用 Three.js 生成三维记忆场景，照片环绕发光。【避免】空场景。",
    entranceNarration = "沿着潮声走进去。",
    palette = List("#1B2A4A", "#F2A65A", "#E8D5B7"),
    avoid = List("空场景"),
    userHint = None
  )

  private val run = SceneRun(
    id = SceneRunId(UUID.fromString("00000000-0000-0000-0000-000000003004")),
    exhibitionId = exhibitionId,
    requestedBy = ownerId,
    status = SceneRunStatus.AwaitingCapture,
    source = Some(SceneSource.Ai),
    hint = Some("想要更安静一点"),
    photoIds = photos.map(_.id),
    curationVersion = 1,
    runtimeVersion = SceneContract.RuntimeVersion,
    brief = Some(brief),
    code = Some("function build(ctx) { ctx.addOrbitControls(); }"),
    review = None,
    runtimeEvidence = None,
    attempts = 0,
    promptVersion = "scene-parent-v1",
    errorCode = None,
    errorMessage = None,
    createdAt = now,
    updatedAt = now
  )

  private val evidence = RuntimeEvidence(buildMs = 42, fps = 54.5, errors = Nil, photoIdsUsed = photos.map(_.id), networkAttempts = 0)

  private val captions = Map(photoA -> "日落时的礁石", photoB -> "退潮后的盐光")

  test("评审提示词：人类策展人立场、区域证据、防注入、只看渲染、issues/summary 上限") {
    val prompt = SceneReviewPrompts.review(run, captions, evidence)
    val text = prompt.instructions
    assert(text.contains("人类策展人"), "必须明确人类策展人立场")
    assert(text.contains("左/中/右"), "必须要求引用截图具体区域作为证据")
    assert(text.contains("视为数据") && text.contains("注入"), "必须声明截图文字视为数据、防提示词注入")
    assert(text.contains("不得因为画面外的承诺") || text.contains("只看这四张渲染图"), "不得因代码承诺加分")
    assertEquals(SceneContract.CaptureCount, 4)
    assert(text.contains("四面"), "四视角评审必须检查建筑各面")
    assert(text.contains("最弱的 1–2 个维度"), "issues 必须落在最弱 1–2 维")
    assert(text.contains(s"≤${SceneContract.MaxReviewIssues} 条"), "必须约束 issues ≤6 条")
    assert(text.contains(s"≤${SceneContract.MaxReviewSummaryLength} 字"), "必须约束 summary ≤200 字")
    assert(text.contains("moodMatch") && text.contains("photoPresence") && text.contains("completeness"), "五维必须齐全")
    assert(text.contains(photoA.value.toString) && text.contains("日落时的礁石"), "必须带照片清单与图注")
    assert(prompt.sessionId == run.id.value.toString)
    assert(prompt.system.exists(_.nonEmpty), "评审必须有 system 提示")
    assert(prompt.temperature.exists(_ <= 0.3), "评审温度应偏低")
    assertEquals(SceneReviewPrompts.Version, "scene-review-v3.3")
    assert(text.contains("scene-review-v3.3"), "评审提示词必须带阶段版本标注")
    assert(text.contains("照片情绪在场感"), "photoPresence 语义必须改为照片情绪在场感")
    assert(text.contains("不要求照片实体出现"), "必须写明不要求照片实体出现")
    assert(text.contains("出现照片实体反而扣分") || text.contains("photoPresence 不得高于 2"), "必须写明出现照片实体会扣分")
    assert(!text.contains("必须出现的照片"), "评审提示词不得再要求照片必须出现")
    assert(text.contains("设计感检查（v3.3"), "评审提示词必须含 v3 设计感检查")
    assert(text.contains("水面纯色无纹理"), "评审必须点名水面纯色无纹理扣分")
    assert(text.contains("构件 <6"), "评审必须点名建筑构件不足扣分")
    assert(text.contains("结构细节可辨认"), "completeness 锚点必须含结构细节可辨认")
    assert(text.contains("扣分，不封顶") && text.contains("扣 1 档"), "v3.3：设计感检查改为扣分而非封顶")
    assert(!text.contains("各不得高于 2；\"盒子"), "水面/建筑简陋不再硬封顶 2 分")
    assert(text.contains("只核对主地标"), "四面成立只核对主地标，次要建筑不扣分")
    assert(text.contains("水面有可读表面"), "completeness 锚点必须含水面可读表面")
    assert(text.contains("字符串数组"), "必须显式要求 issues 为字符串数组")
    assert(text.contains("维度｜截图证据｜可执行改法"), "必须给 issues 元素的「｜」连接格式")
    assert(text.contains("\"issue\"") && text.contains("\"维度\""), "必须给出 object/中文字段名反例")
    assert(text.contains("格式错误") || text.contains("会被拒绝"), "必须说明反例会被拒绝")
    val exampleIssues = prompt.responseExample.hcursor.downField("issues").as[List[io.circe.Json]].toOption
    assert(exampleIssues.exists(_.forall(_.isString)), "responseExample 的 issues 必须是字符串数组")
    assert(text.contains("verdict 只允许"), "必须显式约束 verdict 取值")
    assert(text.contains("\"pass\"") && text.contains("\"revise\""), "必须写明 verdict 只允许 pass/revise")
    assert(text.contains("\"verdict\":\"fail\""), "必须给出 verdict=fail 反例")
  }

  test("评审提示词的 responseExample 是合法 SceneReview，且能通过服务端判定") {
    val prompt = SceneReviewPrompts.review(run, captions, evidence)
    prompt.responseExample.as[SceneReview] match
      case Right(review) =>
        assertEquals(review.verdict, ReviewVerdict.Pass)
        assert(review.scores.moodMatch >= 1 && review.scores.completeness <= 5)
        assert(ReviewDecision.normalize(review, 3.0).isRight, "形状示例应能被 normalize 接受")
      case Left(error) => fail(s"responseExample 不是合法 SceneReview：${error.message}")
  }

  test("修复提示词：保留题面与上一版代码，列出 issues，并要求纯程序化（禁照片实体）") {
    val issues = List("运行时存在错误：TypeError", "场景出现照片实体：应改为纯程序化环境")
    val prompt = SceneCodePrompts.repairSceneCode("run-repair", brief, state, "function build(ctx) { /* v1 */ }", issues, 60)
    val text = prompt.instructions
    assert(text.contains(brief.scenePrompt), "修复必须保留原题面")
    assert(text.contains("function build(ctx) { /* v1 */ }"), "修复必须带上上一版代码")
    issues.foreach(issue => assert(text.contains(issue), s"修复提示词缺少 issue：$issue"))
    assert(!text.contains("必须使用全部 ctx.photos"), "修复不得再要求使用全部照片")
    assert(text.contains("不得使用 ctx.photos"), "修复必须禁止使用 ctx.photos 纹理")
    assert(text.contains("照片墙"), "修复必须禁止照片墙/相框等照片实体")
    photos.foreach(photo => assert(!text.contains(photo.id.value.toString), s"修复提示词不应再列照片实体 ${photo.id.value}"))
    assert(text.contains("function build(ctx)"))
    assert(text.contains("不得 fetch"), "必须重申禁止联网")
    assertEquals(SceneCodePrompts.RepairVersion, "scene-repair-v3.2")
    assert(text.contains("scene-repair-v3.2"), "修复提示词必须带阶段版本标注")
    assert(text.contains("设计实现要求（v3"), "修复提示词必须含 v3 设计实现要求")
  }

  test("版本常量：父/子共用 scene-parent-v3，评审/修复各自独立，父/子提示词均带标注") {
    assertEquals(SceneContract.PromptVersion, "scene-parent-v3.5")
    assertEquals(SceneContract.ScenePromptVersion, "scene-parent-v3.5")
    assertEquals(SceneContract.SceneReviewPromptVersion, "scene-review-v3.3")
    assertEquals(SceneContract.SceneRepairPromptVersion, "scene-repair-v3.2")
    assertEquals(SceneCodePrompts.Version, "scene-parent-v3.5")
    assertEquals(SceneReviewPrompts.Version, "scene-review-v3.3")
    assertEquals(SceneCodePrompts.RepairVersion, "scene-repair-v3.2")

    val briefPrompt = SceneBriefPrompts.writeBrief("run-version", state, analyses, None, 60)
    assert(briefPrompt.instructions.contains("scene-parent-v3.5"), "父题面必须带共用版本标注")
    val codePrompt = SceneCodePrompts.generateSceneCode("run-version", brief, state, 60)
    assert(codePrompt.instructions.contains("scene-parent-v3.5"), "子代码生成必须带共用版本标注")
  }
