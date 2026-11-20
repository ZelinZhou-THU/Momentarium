package services.scene

import java.util.UUID

import services.gallery.objects.{CoverKind, Exhibition, ExhibitionGroup, ExhibitionId, GroupId, PhotoId}
import services.scene.objects.*
import services.scene.utils.{SceneContract, SceneInstruction, SceneRevisionCapacity, SceneState}
import services.scene.utils.prompts.SceneRevisePrompts
import services.system.ai.objects.TextPrompt
import services.system.config.SceneConfig
import services.users.objects.UserId

/**
 * 阶段 4 修订纯逻辑单元测试（无数据库/无模型）：
 * 指令规范化与计数、修订容量（父代码上限/提示词字节/上下文保守估算）、scene-revise-v1 提示词分隔与版本。
 */
class SceneRevisionUnitSpec extends munit.FunSuite:

  // ---------- 指令（api-contract v1.14 §4.1） ----------

  test("指令：trim 首尾空白后返回原文（保留内部换行与制表符）") {
    val raw = "  把灯塔的暖光调亮\n\t雾淡一些  "
    assertEquals(SceneInstruction.normalize(raw), Right("把灯塔的暖光调亮\n\t雾淡一些"))
  }

  test("指令：空、纯空白、超过 500 码点、NUL 等控制字符被拒绝") {
    assert(SceneInstruction.normalize("").isLeft, "空串")
    assert(SceneInstruction.normalize("   \n\t ").isLeft, "纯空白")
    assert(SceneInstruction.normalize("灯" * SceneContract.MaxRevisionInstructionCodePoints).isRight, "恰好 500 码点")
    assert(SceneInstruction.normalize("灯" * (SceneContract.MaxRevisionInstructionCodePoints + 1)).isLeft, "501 码点")
    assert(SceneInstruction.normalize("调亮\u0000其余").isLeft, "NUL")
    assert(SceneInstruction.normalize("调亮\u0007其余").isLeft, "BEL")
    assert(SceneInstruction.normalize("调亮\u007f其余").isLeft, "DEL")
  }

  test("指令：计数按 Unicode 码点（emoji 占 1 个码点，代理对不重复计数）") {
    val emoji = "🎈"
    assert(SceneInstruction.normalize(emoji * SceneContract.MaxRevisionInstructionCodePoints).isRight)
    assert(SceneInstruction.normalize(emoji * (SceneContract.MaxRevisionInstructionCodePoints + 1)).isLeft)
  }

  // ---------- 容量（api-contract v1.14 §4.1 / spec §10.6） ----------

  private val config = SceneConfig(reviewPassScore = 3.0, maxRevisions = 2, codeLimitKb = 1024)

  private def promptOf(bytes: Int): TextPrompt =
    TextPrompt(sessionId = "session", instructions = "x" * bytes)

  test("容量：父代码超过 SCENE_CODE_LIMIT_KB 时拒绝（不静默截断）") {
    val code = "y" * (config.codeLimitKb * 1024 + 1)
    assert(SceneRevisionCapacity.check(code, promptOf(16), config.codeLimitKb).isLeft)
    assertEquals(SceneRevisionCapacity.check("y" * 1024, promptOf(16), config.codeLimitKb), Right(()))
  }

  test("容量：提示词超过 2 MiB 拒绝") {
    val huge = promptOf((SceneContract.MaxRevisionPromptBytes + 1).toInt)
    assert(SceneRevisionCapacity.check("function build(ctx) {}", huge, config.codeLimitKb).isLeft)
  }

  test("容量：按 3 UTF-8 字节/token 保守估算，超出上下文预算拒绝") {
    assert(SceneRevisionCapacity.estimatedTokens(0L) == 0L)
    assert(SceneRevisionCapacity.estimatedTokens(4L) == 2L)
    val tokensAtBudget = SceneRevisionCapacity.ConservativeContextTokens
    val bytesJustOver = tokensAtBudget * SceneRevisionCapacity.ConservativeBytesPerToken + 1
    val tooMany = promptOf(bytesJustOver.toInt)
    assert(SceneRevisionCapacity.check("function build(ctx) {}", tooMany, config.codeLimitKb).isLeft)
  }

  // ---------- 修订提示词 ----------

  private val state =
    val exhibition = Exhibition(
      id = ExhibitionId(UUID.randomUUID()),
      ownerId = UserId(UUID.randomUUID()),
      title = "雾港",
      narrative = "海边与灯塔。",
      curationVersion = 3,
      coverKind = CoverKind.Auto,
      coverPhotoId = None,
      coverStorageKey = None,
      coverMime = None,
      coverWidth = None,
      coverHeight = None,
      createdAt = java.time.Instant.parse("2026-11-01T00:00:00Z"),
      updatedAt = java.time.Instant.parse("2026-11-01T00:00:00Z")
    )
    val group = ExhibitionGroup(GroupId(UUID.randomUUID()), exhibition.id, "章一", "", 0)
    val photo = services.gallery.objects.ExhibitionPhoto(
      id = PhotoId(UUID.randomUUID()),
      exhibitionId = exhibition.id,
      storageKey = "k",
      thumbKey = "t",
      originalName = "a.jpg",
      mime = "image/jpeg",
      width = Some(10),
      height = Some(10),
      groupId = Some(group.id),
      positionInGroup = Some(0),
      caption = "灯塔",
      archivedAt = None,
      createdAt = exhibition.createdAt
    )
    SceneState(exhibition, List(group), List(photo))

  private val brief = SceneBrief(
    mood = "安静的眷恋",
    memoryReading = "海边的光。",
    scenePrompt = "海岸灯塔，暖光，薄雾。",
    entranceNarration = "沿着潮声走向灯塔。",
    palette = List("#2F3A44", "#E8A24A", "#9BA8A6"),
    avoid = Nil,
    userHint = None
  )

  test("scene-revise-v1：版本、父题面/父代码/指令都作为明确分隔的不可信数据、保留局部修改约束") {
    val prompt = SceneRevisePrompts.reviseScene(
      sessionId = "session",
      parentBrief = brief,
      parentCode = "function build(ctx) { /* parent */ }",
      state = state,
      instruction = "把灯塔的暖光调亮一点",
      codeLimitKb = 1024
    )
    assertEquals(SceneRevisePrompts.Version, "scene-revise-v1")
    assert(prompt.instructions.contains("scene-revise-v1"))
    assert(prompt.instructions.contains("不可信数据"))
    assert(prompt.instructions.contains("<<<USER_REVISION_INSTRUCTION"))
    assert(prompt.instructions.contains("<<<PARENT_SCENE_CODE"))
    assert(prompt.instructions.contains("function build(ctx) { /* parent */ }"))
    assert(prompt.instructions.contains("只修改用户点名的元素及其直接依赖"), "必须要求局部修改、保留其他构图/材质/机位")
    assert(prompt.instructions.contains("不得使用 ctx.photos"), "必须沿用纯场景约束")
    assert(prompt.instructions.contains("代码不超过 1024 KB"))
    assertEquals(SceneRevisionCapacity.check(
      "function build(ctx) { /* parent */ }",
      prompt,
      1024
    ), Right(()))
  }
