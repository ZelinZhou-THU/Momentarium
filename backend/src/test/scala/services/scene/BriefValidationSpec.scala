package services.scene

import java.time.Instant
import java.util.UUID

import munit.FunSuite

import services.gallery.objects.*
import services.scene.objects.SceneBrief
import services.scene.utils.{BriefValidation, SceneContract, SceneState}
import services.scene.utils.prompts.SceneBriefPrompts
import services.users.objects.UserId

/** 父题面语义校验：示例本身合规；分节/长度/色值/avoid 覆盖的违规都能给出可回灌的原因。 */
class BriefValidationSpec extends FunSuite:

  private val now = Instant.parse("2026-10-29T12:00:00Z")

  private val exhibition = Exhibition(
    id = ExhibitionId(UUID.fromString("00000000-0000-0000-0000-000000004001")),
    ownerId = UserId(UUID.fromString("00000000-0000-0000-0000-000000004002")),
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

  private val state = SceneState(exhibition, Nil, Nil)

  private def exampleBrief: SceneBrief =
    SceneBriefPrompts
      .writeBrief("run-validation", state, Map.empty, Some("安静一点"), 60)
      .responseExample
      .as[SceneBrief]
      .fold(error => fail(s"示例题面无法解码：${error.getMessage}"), identity)

  test("提示词里的示例题面本身通过校验（模型照着示例写不会被打回）") {
    assertEquals(BriefValidation.validate(exampleBrief), Nil)
  }

  test("缺分节、长度越界时指出具体分节与字数") {
    val issues = BriefValidation.validate(exampleBrief.copy(scenePrompt = "【任务】只有一句话。"))
    assert(issues.exists(issue => issue.contains("scenePrompt 长度") && issue.contains(s"${SceneContract.MinScenePromptLength}")), issues.toString)
    assert(issues.exists(issue => issue.contains("缺少分节") && issue.contains("【避免】") && !issue.contains("【任务】")), issues.toString)
  }

  test("palette 数量与 #RRGGBB 格式都要校验") {
    val issues = BriefValidation.validate(exampleBrief.copy(palette = List("#0B1020", "orange")))
    assert(issues.exists(_.contains("palette 应为")), issues.toString)
    assert(issues.exists(issue => issue.contains("#RRGGBB") && issue.contains("orange")), issues.toString)
  }

  test("avoid 按关键词覆盖判断：换种说法不算违规，缺项会点名") {
    val paraphrased = List(
      "水面纯色、没有纹理",
      "盒子加三角屋顶的简陋建筑",
      "画面近黑、没有主光",
      "首屏大片空带",
      "随机球体堆叠当装饰",
      "照片直贴或相框陈列",
      "逐块 Mesh 导致 fps 崩"
    )
    assertEquals(BriefValidation.validate(exampleBrief.copy(avoid = paraphrased)), Nil)

    val missing = BriefValidation.validate(exampleBrief.copy(avoid = paraphrased.filterNot(_.contains("空带")).filterNot(_.contains("相框"))))
    assert(missing.exists(issue => issue.contains("大片空带")), missing.toString)
    assert(missing.exists(_.contains("至少要包含")), missing.toString)
  }

  test("重写提示词保留原要求并逐条列出上一版问题") {
    val prompt = SceneBriefPrompts.rewriteBrief("run-validation", state, Map.empty, None, 60, List("palette 应为 3–5 个颜色"))
    assert(prompt.instructions.contains("【写作规则（硬性）】"))
    assert(prompt.instructions.contains("未通过服务端校验"))
    assert(prompt.instructions.contains("1. palette 应为 3–5 个颜色"))
  }
