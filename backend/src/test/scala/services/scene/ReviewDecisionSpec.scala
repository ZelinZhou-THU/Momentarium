package services.scene

import java.time.Instant
import java.util.UUID

import munit.FunSuite

import services.gallery.objects.{ExhibitionId, PhotoId}
import services.scene.objects.*
import services.scene.objects.apiTypes.RuntimeEvidence
import services.scene.utils.{RepairBudget, ReviewDecision, ReviewOutcome, SceneCaptures, SceneContract}
import services.users.objects.UserId

/**
 * 主观验收纯判定（spec §9.5 / scene-prompt-spec §3.3）：硬门禁逐条、五维权重与阈值、
 * 单项下限、issues/summary 上限、通过/修订/用尽兜底/门禁失败/模型异常分支、截图输入校验。
 */
class ReviewDecisionSpec extends FunSuite:

  private val now = Instant.parse("2026-10-27T12:00:00Z")
  private val photoA = PhotoId(UUID.fromString("00000000-0000-0000-0000-00000000a001"))
  private val photoB = PhotoId(UUID.fromString("00000000-0000-0000-0000-00000000a002"))
  private val photoC = PhotoId(UUID.fromString("00000000-0000-0000-0000-00000000a003"))
  private val photoIds = List(photoA, photoB, photoC)

  private val passes4 = RubricScores(4, 4, 4, 4, 4)
  private val passScore = 3.0
  private val maxRevisions = 2

  private def run(
    code: Option[String] = Some("function build(ctx) { ctx.addOrbitControls(); }"),
    runtimeVersion: String = SceneContract.RuntimeVersion,
    photoIds: List[PhotoId] = photoIds
  ): SceneRun =
    SceneRun(
      id = SceneRunId(UUID.fromString("00000000-0000-0000-0000-00000000b001")),
      exhibitionId = ExhibitionId(UUID.fromString("00000000-0000-0000-0000-00000000b002")),
      requestedBy = UserId(UUID.fromString("00000000-0000-0000-0000-00000000b003")),
      status = SceneRunStatus.Reviewing,
      source = Some(SceneSource.Ai),
      hint = None,
      photoIds = photoIds,
      curationVersion = 1,
      runtimeVersion = runtimeVersion,
      brief = Some(
        SceneBrief(
          mood = "安静的眷恋",
          memoryReading = "海风与退潮",
          scenePrompt = "【任务】用 Three.js 生成三维记忆场景",
          entranceNarration = "沿着潮声走进去。",
          palette = List("#0B1020", "#F2A65A", "#7DD3FC"),
          avoid = List("空场景"),
          userHint = None
        )
      ),
      code = code,
      review = None,
      runtimeEvidence = None,
      attempts = 0,
      promptVersion = "scene-parent-v1",
      errorCode = None,
      errorMessage = None,
      createdAt = now,
      updatedAt = now
    )

  private def evidence(
    fps: Double = 54.5,
    errors: List[String] = Nil,
    used: List[PhotoId] = photoIds,
    networkAttempts: Int = 0
  ): RuntimeEvidence =
    RuntimeEvidence(buildMs = 42, fps = fps, errors = errors, photoIdsUsed = used, networkAttempts = networkAttempts)

  private def jpegBytes(size: Int = 16): Array[Byte] =
    Array[Byte](0xff.toByte, 0xd8.toByte, 0xff.toByte) ++ Array.fill(math.max(0, size - 3))(0x20.toByte)

  private def dataUrl(bytes: Array[Byte]): String =
    s"data:image/jpeg;base64,${java.util.Base64.getEncoder.encodeToString(bytes)}"

  private def validCaptures: Either[List[String], List[services.system.ai.objects.ImageBytes]] =
    SceneCaptures.parse(List.fill(4)(dataUrl(jpegBytes())))

  // ---------- 五维权重与阈值 ----------

  test("加权分按 .30/.25/.20/.15/.10 计算") {
    assertEqualsDouble(ReviewDecision.weightedScore(RubricScores(5, 4, 3, 2, 1)), 3.5, 1e-9)
    assertEqualsDouble(ReviewDecision.weightedScore(passes4), 4.0, 1e-9)
  }

  test("通过阈值：加权 ≥3.0 且无单项<2 且 mood≥3 且 photo≥3") {
    assert(ReviewDecision.isPass(passes4, passScore))
    assert(ReviewDecision.isPass(RubricScores(3, 3, 3, 3, 3), passScore), "全 3 分恰为 3.0 边界，应通过")
    assert(!ReviewDecision.isPass(RubricScores(3, 3, 3, 3, 2), passScore), "2.9 应不通过")
  }

  test("设计感 v3 门槛：lightingColor ≥3 且 composition ≥3") {
    assert(
      !ReviewDecision.isPass(RubricScores(5, 5, 5, 2, 5), passScore),
      "lightingColor=2 应不通过（即使加权 4.55）"
    )
    assert(
      !ReviewDecision.isPass(RubricScores(5, 5, 2, 5, 5), passScore),
      "composition=2 应不通过（即使加权 4.4）"
    )
    assert(
      ReviewDecision.isPass(RubricScores(5, 5, 3, 3, 5), passScore),
      "lightingColor=3 且 composition=3 的边界应通过"
    )
  }

  test("单项下限：任一维 <2 即不通过（即使加权很高）") {
    assert(!ReviewDecision.isPass(RubricScores(5, 5, 5, 5, 1), passScore))
    assert(!ReviewDecision.isPass(RubricScores(1, 5, 5, 5, 5), passScore))
    assert(ReviewDecision.isPass(RubricScores(5, 5, 5, 5, 2), passScore), "2 分不是 <2，应允许")
  }

  test("moodMatch/photoPresence 单项门槛：低于 3 直接不通过") {
    assert(!ReviewDecision.isPass(RubricScores(2, 5, 5, 5, 5), passScore))
    assert(!ReviewDecision.isPass(RubricScores(5, 2, 5, 5, 5), passScore))
    assert(ReviewDecision.isPass(RubricScores(3, 3, 5, 5, 5), passScore))
  }

  // ---------- 硬门禁 7 条 ----------

  test("硬门禁全过时 gateFailures 为空（照片覆盖用集合判断，顺序无关）") {
    val shuffled = List(photoC, photoA, photoB)
    assertEquals(ReviewDecision.gateFailures(run(), evidence(used = shuffled), validCaptures, 60), Nil)
  }

  test("门禁 1：代码为空/超限/runtimeVersion 不一致") {
    assert(ReviewDecision.gateFailures(run(code = None), evidence(), validCaptures, 60).exists(_.contains("代码为空")))
    assert(
      ReviewDecision.gateFailures(run(code = Some("   ")), evidence(), validCaptures, 60).exists(_.contains("代码为空"))
    )
    val oversized = "a" * (60 * 1024 + 1)
    assert(ReviewDecision.gateFailures(run(code = Some(oversized)), evidence(), validCaptures, 60).exists(_.contains("60KB")))
    assert(
      ReviewDecision.gateFailures(run(runtimeVersion = "0"), evidence(), validCaptures, 60).exists(_.contains("运行时契约版本"))
    )
  }

  test("门禁 2：runtime.errors 必须为空") {
    val issues = ReviewDecision.gateFailures(run(), evidence(errors = List("ReferenceError: x is not defined")), validCaptures, 60)
    assert(issues.exists(_.contains("运行时存在错误")))
    assert(issues.exists(_.contains("ReferenceError")))
  }

  test("纯场景：照片覆盖不再是门禁（photoIdsUsed 为空/缺照片也通过）") {
    assertEquals(
      ReviewDecision.gateFailures(run(), evidence(used = Nil), validCaptures, 60),
      Nil,
      "纯程序化场景不要求照片实体出现，photoIdsUsed 为空不应是门禁失败"
    )
    assertEquals(
      ReviewDecision.gateFailures(run(), evidence(used = List(photoA)), validCaptures, 60),
      Nil,
      "缺照片也不再触发覆盖门禁"
    )
    assertEquals(
      ReviewDecision.gateFailures(run(), evidence(used = photoIds :+ PhotoId(UUID.randomUUID())), validCaptures, 60),
      Nil,
      "多出的 photoIdsUsed 不影响判定"
    )
  }

  test("门禁 4：networkAttempts 必须为 0") {
    assert(ReviewDecision.gateFailures(run(), evidence(networkAttempts = 1), validCaptures, 60).exists(_.contains("网络请求")))
  }

  test("门禁 5：fps ≥20") {
    assert(ReviewDecision.gateFailures(run(), evidence(fps = 19.9), validCaptures, 60).exists(_.contains("帧率过低")))
    assertEquals(ReviewDecision.gateFailures(run(), evidence(fps = 20.0), validCaptures, 60), Nil)
  }

  test("门禁 6：截图必须 4 张合法 JPEG data URL") {
    def gate(captures: List[String]): List[String] =
      ReviewDecision.gateFailures(run(), evidence(), SceneCaptures.parse(captures), 60)
    assert(gate(List(dataUrl(jpegBytes()))).exists(_.contains("截图数量")))
    assert(gate(List.fill(4)(dataUrl(jpegBytes()))).isEmpty)
    assert(gate(List("not-a-data-url") ++ List.fill(3)(dataUrl(jpegBytes()))).exists(_.contains("data URL")))
  }

  test("构建阶段崩溃：没有截图只有 errors 时，只回报错误原文，不再列截图数量与帧率") {
    val crashed = evidence(fps = 0, errors = List("build: BUILD_FAILED: x is not defined（第 12 行：x.add(y)）"), used = Nil)
    assert(ReviewDecision.isCrashBeforeRender(Nil, crashed))
    assert(!ReviewDecision.isCrashBeforeRender(List(dataUrl(jpegBytes())), crashed))
    assert(!ReviewDecision.isCrashBeforeRender(Nil, evidence(errors = Nil)))
    val issues = ReviewDecision.gateFailures(run(), crashed, SceneCaptures.parse(Nil), 60, crashedBeforeRender = true)
    assertEquals(issues.size, 1, issues.toString)
    assert(issues.head.contains("构建阶段崩溃"))
    assert(issues.head.contains("第 12 行"))
    val decided = decide(issues, None, attempts = 0, crashed = true)
    assert(decided.isInstanceOf[ReviewOutcome.RepairBuild], s"构建崩溃应先用独立的构建修复额度：$decided")
  }

  // ---------- 截图输入校验 ----------

  test("SceneCaptures：合法 4 张 JPEG 返回图片字节与 image/jpeg") {
    val parsed = SceneCaptures.parse(List.fill(4)(dataUrl(jpegBytes())))
    assert(parsed.isRight)
    parsed.foreach(images => assert(images.forall(_.mimeType == "image/jpeg") && images.size == 4))
  }

  test("SceneCaptures：数量、前缀、base64、JPEG 魔数、2MB 上限逐条拒绝") {
    def issues(captures: List[String]): List[String] =
      SceneCaptures.parse(captures).fold(identity, _ => Nil)
    assert(issues(List(dataUrl(jpegBytes()))).exists(_.contains("截图数量")))
    assert(issues(List("data:image/png;base64,AAAA", dataUrl(jpegBytes()))).exists(_.contains("image/jpeg")))
    assert(issues(List("data:image/jpeg;base64,!!!!", dataUrl(jpegBytes()))).exists(_.contains("base64")))
    val pngMagic = dataUrl(Array[Byte](0x89.toByte, 0x50.toByte, 0x4e.toByte, 0x47.toByte, 0x0d.toByte))
    assert(issues(List(pngMagic, dataUrl(jpegBytes()))).exists(_.contains("JPEG")))
    val oversized = dataUrl(jpegBytes(SceneContract.MaxCaptureBytes + 1))
    assert(issues(List(oversized, dataUrl(jpegBytes()))).exists(_.contains("2MB")))
    assert(issues(List(dataUrl(jpegBytes()), "garbage")).exists(_.contains("截图 2")))
  }

  // ---------- VLM 输出规范化 ----------

  test("normalize：分数必须 1–5，否则视为模型输出非法") {
    assert(ReviewDecision.normalize(SceneReview(RubricScores(0, 4, 4, 4, 4), ReviewVerdict.Pass, Nil, "x"), passScore).isLeft)
    assert(ReviewDecision.normalize(SceneReview(RubricScores(6, 4, 4, 4, 4), ReviewVerdict.Pass, Nil, "x"), passScore).isLeft)
  }

  test("normalize：verdict 由服务端按阈值重算，不信任模型自报") {
    val low = SceneReview(RubricScores(2, 2, 2, 2, 2), ReviewVerdict.Pass, List("照片太小"), "不通过")
    assertEquals(ReviewDecision.normalize(low.copy(summary = "通过"), passScore).map(_.summary.contains("未通过")), Right(true))
    val high = SceneReview(passes4, ReviewVerdict.Revise, Nil, "通过")
    assertEquals(ReviewDecision.normalize(high.copy(summary = "不通过"), passScore).map(_.summary.startsWith("通过")), Right(true))
  }

  test("normalize：摘要保留通过线精度，避免低于门槛却显示相同数值") {
    val raw = SceneReview(RubricScores(4, 3, 3, 3, 3), ReviewVerdict.Pass, Nil, "通过")
    val review = ReviewDecision.normalize(raw, 3.301).toOption.get
    assertEquals(review.verdict, ReviewVerdict.Revise)
    assert(review.summary.contains("加权分 3.30"), review.summary)
    assert(review.summary.contains("通过线 3.301"), review.summary)
  }
  test("normalize：issues ≤6、summary ≤200 字，revise 时至少一条 issue") {
    val manyIssues = (1 to 10).map(index => s"问题 $index").toList
    val normalized = ReviewDecision
      .normalize(SceneReview(RubricScores(2, 2, 2, 2, 2), ReviewVerdict.Revise, manyIssues, "x" * 300), passScore)
      .toOption
      .get
    assertEquals(normalized.issues.size, SceneContract.MaxReviewIssues)
    assert(normalized.summary.length <= SceneContract.MaxReviewSummaryLength)

    val emptyIssues = ReviewDecision
      .normalize(SceneReview(RubricScores(2, 2, 2, 2, 2), ReviewVerdict.Revise, Nil, "不通过"), passScore)
      .toOption
      .get
    assert(emptyIssues.issues.nonEmpty, "revise 必须给出至少一条可执行 issue")
  }

  // ---------- 门禁评审记录 ----------

  test("gateReview：scores 全 1、verdict=revise、summary 以「硬门禁未通过：」开头并逐条列门禁") {
    val review = ReviewDecision.gateReview(List("运行时存在错误：boom", "帧率过低：12.0 fps"))
    assertEquals(review.scores, RubricScores(1, 1, 1, 1, 1))
    assertEquals(review.verdict, ReviewVerdict.Revise)
    assert(review.summary.startsWith("硬门禁未通过："), review.summary)
    assert(review.summary.contains("运行时存在错误") && review.summary.contains("帧率过低"), review.summary)
    assert(review.issues.size <= SceneContract.MaxReviewIssues)
    assert(review.summary.length <= SceneContract.MaxReviewSummaryLength)
  }

  test("gateReview：门禁原因超过 6 条时 issues 截断，summary 仍 ≤200 字") {
    val issues = (1 to 9).map(index => s"第 $index 条门禁失败原因").toList
    val review = ReviewDecision.gateReview(issues)
    assertEquals(review.issues.size, SceneContract.MaxReviewIssues)
    assert(review.summary.length <= SceneContract.MaxReviewSummaryLength)
  }

  // ---------- 裁决分支（通过 / 修订 / 用尽兜底 / 门禁失败 / 模型异常） ----------

  /** 测试用裁决入口：模型评审先经 normalize（与 SceneReviewFlow 一致），再交给 decide。 */
  private def decide(
    gateIssues: List[String],
    model: Option[Either[String, SceneReview]],
    attempts: Int,
    buildRepairs: Int = 0,
    crashed: Boolean = false,
    previous: Option[SceneReview] = None
  ): ReviewOutcome =
    val normalized = model.map(_.flatMap(raw => ReviewDecision.normalize(raw, passScore)))
    ReviewDecision.decide(
      gateIssues,
      crashed,
      normalized,
      previous,
      RepairBudget(attempts, maxRevisions, buildRepairs, SceneContract.MaxBuildRepairs)
    )

  test("decide：通过 → Passed，评审结果 verdict=pass") {
    val outcome = decide(Nil, Some(Right(SceneReview(passes4, ReviewVerdict.Pass, Nil, "通过"))), 0)
    outcome match
      case ReviewOutcome.Passed(review) => assertEquals(review.verdict, ReviewVerdict.Pass)
      case other => fail(s"应为 Passed，实际：$other")
  }

  test("decide：未通过且 attempts<maxRevisions → Revise（issues 非空）") {
    decide(Nil, Some(Right(SceneReview(RubricScores(2, 2, 2, 2, 2), ReviewVerdict.Revise, List("左前景照片过小"), "不通过"))), 0) match
      case ReviewOutcome.Revise(review, issues) =>
        assertEquals(review.verdict, ReviewVerdict.Revise)
        assert(issues.nonEmpty)
      case other => fail(s"应为 Revise，实际：$other")
  }

  test("decide：用尽修订额度 → Fallback 且保留评审结果") {
    decide(Nil, Some(Right(SceneReview(RubricScores(2, 2, 2, 2, 2), ReviewVerdict.Revise, List("照片不可辨"), "不通过"))), 2) match
      case ReviewOutcome.Fallback(Some(review)) => assertEquals(review.verdict, ReviewVerdict.Revise)
      case other => fail(s"应为 Fallback(Some(review))，实际：$other")
  }

  test("decide：门禁失败视同不通过且不采信模型结论；额度内修订、用尽兜底") {
    val gateIssues = List("运行时存在错误：boom")
    decide(gateIssues, None, 0) match
      case ReviewOutcome.Revise(review, issues) =>
        assertEquals(review.scores, RubricScores(1, 1, 1, 1, 1))
        assert(issues.exists(_.contains("运行时存在错误")))
      case other => fail(s"门禁失败应先修订，实际：$other")

    decide(gateIssues, None, 2) match
      case ReviewOutcome.Fallback(Some(review)) => assert(review.summary.startsWith("硬门禁未通过："))
      case other => fail(s"门禁失败用尽应兜底并保留评审，实际：$other")
  }

  test("decide：构建崩溃先用构建修复额度（不动 attempts），用完再占质量修订，最后兜底") {
    val crash = List("场景代码在构建阶段崩溃，没有渲染出画面：build: CODE_INVALID: Identifier 'leafGeo' has already been declared")
    assert(decide(crash, None, attempts = 0, buildRepairs = 0, crashed = true).isInstanceOf[ReviewOutcome.RepairBuild])
    assert(decide(crash, None, attempts = 2, buildRepairs = 0, crashed = true).isInstanceOf[ReviewOutcome.RepairBuild])
    assert(decide(crash, None, attempts = 0, buildRepairs = 1, crashed = true).isInstanceOf[ReviewOutcome.Revise])
    assert(decide(crash, None, attempts = 2, buildRepairs = 1, crashed = true).isInstanceOf[ReviewOutcome.Fallback])
    assert(
      decide(List("帧率过低：8.0 fps（要求 ≥20）"), None, attempts = 0, crashed = false).isInstanceOf[ReviewOutcome.Revise],
      "渲染出画面后的门禁失败不使用构建修复额度"
    )
  }

  test("decide：评审无有效结果 → 额度内按需要修订处理，沿用上一轮意见；用尽才兜底") {
    val previous = SceneReview(RubricScores(3, 3, 2, 3, 2), ReviewVerdict.Revise, List("composition｜截图1｜圆门偏小"), "上一轮")
    decide(Nil, Some(Left("Missing required field")), 1, previous = Some(previous)) match
      case ReviewOutcome.Revise(review, issues) =>
        assertEquals(issues, previous.issues, "修复方向沿用上一轮评审意见")
        assert(review.issues.head.contains("Missing required field"), review.issues.toString)
        assertEquals(review.scores, previous.scores)
      case other => fail(s"评审无效且有额度应修订，实际：$other")

    decide(Nil, Some(Left("模型输出不是合法 JSON")), 0) match
      case ReviewOutcome.Revise(review, issues) =>
        assertEquals(review.scores, RubricScores(1, 1, 1, 1, 1))
        assert(issues.nonEmpty && !issues.exists(_.contains("没有得到有效结果")), issues.toString)
      case other => fail(s"首轮评审无效也应修订，实际：$other")

    assertEquals(decide(Nil, Some(Left("x")), 2, previous = Some(previous)), ReviewOutcome.Fallback(Some(previous)))
    assertEquals(decide(Nil, Some(Left("x")), 2), ReviewOutcome.Fallback(None))
  }

  test("decide：分数越界经 normalize 判为无效评审，同样走修订而不是直接兜底") {
    val invalid = SceneReview(RubricScores(9, 9, 9, 9, 9), ReviewVerdict.Pass, Nil, "x")
    assert(decide(Nil, Some(Right(invalid)), 0).isInstanceOf[ReviewOutcome.Revise])
  }

  test("attempts 边界：0→1→2 各允许一次修订，第 3 次（attempts=2）不再修订") {
    val revise = Some(Right(SceneReview(RubricScores(2, 2, 2, 2, 2), ReviewVerdict.Revise, List("弱"), "不通过")))
    assert(decide(Nil, revise, 0).isInstanceOf[ReviewOutcome.Revise])
    assert(decide(Nil, revise, 1).isInstanceOf[ReviewOutcome.Revise])
    assert(decide(Nil, revise, 2).isInstanceOf[ReviewOutcome.Fallback])
  }
