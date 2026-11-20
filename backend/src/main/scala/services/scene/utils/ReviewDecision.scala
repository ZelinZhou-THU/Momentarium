package services.scene.utils

import java.nio.charset.StandardCharsets

import services.scene.objects.*
import services.scene.objects.apiTypes.RuntimeEvidence
import services.system.ai.objects.ImageBytes

/**
 * 主观验收的纯判定逻辑（spec §9.5 / scene-prompt-spec §3.3，2026-10-28 起为「纯场景」语义）：
 * 硬门禁 6 条（代码/版本、errors、network、fps、4 张截图、归属与状态；归属与状态由 reviewscene 的条件更新保证）、
 * 五维加权、阈值与修订/兜底裁决。运行时 `photoIdsUsed` 不再是门禁（纯程序化场景不出现照片实体），
 * 即使出现也不影响判定。
 *
 * 所有函数只依赖输入；VLM 调用、状态迁移与 fiber 启动由 SceneReviewFlow / ReviewSceneMessage 组合。
 */
private[scene] object ReviewDecision:

  /** 五维权重（spec §9.5 固定）：moodMatch .30 / photoPresence .25 / composition .20 / lightingColor .15 / completeness .10。 */
  private val MoodMatchWeight = 0.30
  private val PhotoPresenceWeight = 0.25
  private val CompositionWeight = 0.20
  private val LightingColorWeight = 0.15
  private val CompletenessWeight = 0.10

  /** 门禁失败时的代理分数：契约要求 scores 为 1–5，1 是 rubric 最低档，明确表示未进入 VLM 评分。 */
  private val GateFailureScore = 1

  private val DefaultReviseIssue = "整体未达到通过标准：请对照题面优先补强情绪契合与场景对照片组情绪的呼应。"
  private val DefaultSummary = "评审完成。"

  /** 五维加权分（不四舍五入；阈值比较用原始值）。 */
  def weightedScore(scores: RubricScores): Double =
    scores.moodMatch * MoodMatchWeight +
      scores.photoPresence * PhotoPresenceWeight +
      scores.composition * CompositionWeight +
      scores.lightingColor * LightingColorWeight +
      scores.completeness * CompletenessWeight

  /**
   * 通过判定（spec §9.5 + 设计感 v3）：加权 ≥ passScore 且无单项 <2 且
   * moodMatch ≥3、photoPresence ≥3（照片情绪在场感）、**lightingColor ≥3、composition ≥3**。
   */
  def isPass(scores: RubricScores, passScore: Double): Boolean =
    val dimensions = List(
      scores.moodMatch,
      scores.photoPresence,
      scores.composition,
      scores.lightingColor,
      scores.completeness
    )
    weightedScore(scores) >= passScore &&
      dimensions.forall(_ >= SceneContract.MinDimensionScore) &&
      scores.moodMatch >= SceneContract.MinMoodMatch &&
      scores.photoPresence >= SceneContract.MinPhotoPresence &&
      scores.lightingColor >= SceneContract.MinLightingColor &&
      scores.composition >= SceneContract.MinComposition

  /** 客户端没有截图但回传了运行时错误：代码在渲染前就崩溃了（见 gateFailures）。 */
  def isCrashBeforeRender(captures: List[String], evidence: RuntimeEvidence): Boolean =
    captures.isEmpty && evidence.errors.nonEmpty

  def verdictOf(scores: RubricScores, passScore: Double): ReviewVerdict =
    if isPass(scores, passScore) then ReviewVerdict.Pass else ReviewVerdict.Revise

  /**
   * 硬门禁（2026-10-28 纯场景语义：6 条；「运行属于调用者且状态可评审」由条件更新在 claim 时原子保证）。
   * 照片覆盖（photoIdsUsed）不再是门禁：三维场景为纯程序化环境，不出现照片实体，runtime 是否上报照片不影响判定。
   * 返回可直接展示、也可回灌修复提示词的中文原因列表；未通过时调用方不调用 VLM。
   *
   * 构建阶段崩溃（客户端没有截图、只回传了 errors：代码编译失败 / build 抛错 / 超时）时，
   * 截图数量与帧率是崩溃的后果而不是独立问题，不再列出，避免冲淡修复提示词里的错误原文。
   */
  def gateFailures(
    run: SceneRun,
    evidence: RuntimeEvidence,
    captures: Either[List[String], List[ImageBytes]],
    codeLimitKb: Int,
    crashedBeforeRender: Boolean = false
  ): List[String] =
    val codeIssues = run.code match
      case None => List("场景代码为空")
      case Some(code) if code.trim.isEmpty => List("场景代码为空")
      case Some(code) =>
        val bytes = code.getBytes(StandardCharsets.UTF_8).length
        if bytes > codeLimitKb * 1024 then
          List(s"场景代码超过 ${codeLimitKb}KB 上限（实际 ${(bytes + 1023) / 1024}KB）")
        else Nil

    val versionIssues =
      if run.runtimeVersion == SceneContract.RuntimeVersion then Nil
      else List(s"运行时契约版本不一致（运行 ${run.runtimeVersion}，当前 ${SceneContract.RuntimeVersion}）")

    val errorIssues =
      if evidence.errors.isEmpty then Nil
      else
        val detail = evidence.errors.take(3).mkString("；")
        val suffix = if evidence.errors.size > 3 then s"；等 ${evidence.errors.size} 条" else ""
        val label = if crashedBeforeRender then "场景代码在构建阶段崩溃，没有渲染出画面" else "运行时存在错误"
        List(s"$label：$detail$suffix")

    val networkIssues =
      if evidence.networkAttempts == 0 then Nil
      else List(s"运行期发生 ${evidence.networkAttempts} 次网络请求（要求 0）")

    val fpsIssues =
      if crashedBeforeRender || evidence.fps >= SceneContract.MinFps then Nil
      else List(f"帧率过低：${evidence.fps}%.1f fps（要求 ≥${SceneContract.MinFps.toInt}）")

    val captureIssues = if crashedBeforeRender then Nil else captures.fold(identity, _ => Nil)

    codeIssues ++ versionIssues ++ errorIssues ++ networkIssues ++ fpsIssues ++ captureIssues

  /**
   * 校验并规范化 VLM 输出：分数必须 1–5；verdict 由服务端按阈值重算（不信模型自报结论）；
   * issues 去空、≤6 条（revise 时至少 1 条可执行问题）；summary 根据最终分数和结论生成、≤200 字。
   */
  def normalize(raw: SceneReview, passScore: Double): Either[String, SceneReview] =
    val dimensionScores = List(
      raw.scores.moodMatch,
      raw.scores.photoPresence,
      raw.scores.composition,
      raw.scores.lightingColor,
      raw.scores.completeness
    )
    val outOfRange = dimensionScores.filter(score => score < 1 || score > 5)
    if outOfRange.nonEmpty then Left(s"评审分数必须为 1–5，实际：${outOfRange.mkString("、")}")
    else
      val verdict = verdictOf(raw.scores, passScore)
      val nonEmptyIssues = raw.issues.map(_.trim).filter(_.nonEmpty)
      val issues =
        if verdict == ReviewVerdict.Revise && nonEmptyIssues.isEmpty then List(DefaultReviseIssue)
        else nonEmptyIssues.take(SceneContract.MaxReviewIssues)
      Right(SceneReview(raw.scores, verdict, issues, summaryOf(raw.scores, verdict, passScore)))

  /** 硬门禁失败时的评审记录（不调用 VLM，不是 VLM 评分）：scores 全 1、revise、issues=门禁原因。 */
  def gateReview(issues: List[String]): SceneReview =
    val nonEmptyIssues = issues.map(_.trim).filter(_.nonEmpty)
    val allIssues = if nonEmptyIssues.isEmpty then List("硬门禁未通过") else nonEmptyIssues
    SceneReview(
      scores = RubricScores(GateFailureScore, GateFailureScore, GateFailureScore, GateFailureScore, GateFailureScore),
      verdict = ReviewVerdict.Revise,
      issues = allIssues.take(SceneContract.MaxReviewIssues),
      summary = summarize(s"硬门禁未通过：${allIssues.mkString("；")}")
    )

  /**
   * 评审模型没有给出有效结果时的评审记录：沿用上一轮评审（若有）并在 issues 最前写明原因；
   * 没有上一轮时与门禁记录同样用全 1 代理分数，表示这一轮没有得到模型评分。
   */
  def invalidReview(reason: String, previous: Option[SceneReview]): SceneReview =
    val diagnostic = s"本轮评审没有得到有效结果（$reason），按需要修订处理"
    previous match
      case Some(base) => base.copy(issues = (diagnostic :: base.issues).take(SceneContract.MaxReviewIssues))
      case None =>
        SceneReview(
          scores = RubricScores(GateFailureScore, GateFailureScore, GateFailureScore, GateFailureScore, GateFailureScore),
          verdict = ReviewVerdict.Revise,
          issues = List(diagnostic, InvalidReviewRepairIssue),
          summary = summarize(diagnostic)
        )

  /** 评审无效且没有上一轮意见时交给修复的方向：只做确定无害的复查，不凭空改动风格。 */
  private val InvalidReviewRepairIssue =
    "评审未给出具体意见：请对照题面复查首屏构图、主光层次与建筑四面完整性，修正明显缺陷，保留已经成立的部分。"

  /**
   * 裁决（输入均为已规范化的结果）：
   * - 门禁失败视同不通过（不调 VLM）；其中构建阶段崩溃先用独立的构建修复额度，不占修订额度；
   * - 评审模型无有效结果（Some(Left)）：额度内按需要修订处理，用尽时兜底并保留上一轮评审；
   * - 未通过且 attempts < maxRevisions → 修订；用尽 → 兜底并保留评审结果。
   */
  def decide(
    gateIssues: List[String],
    crashedBeforeRender: Boolean,
    modelReview: Option[Either[String, SceneReview]],
    previousReview: Option[SceneReview],
    budget: RepairBudget
  ): ReviewOutcome =
    if gateIssues.nonEmpty then
      val review = gateReview(gateIssues)
      if crashedBeforeRender && budget.buildRepairsLeft then ReviewOutcome.RepairBuild(review, review.issues)
      else if budget.revisionsLeft then ReviewOutcome.Revise(review, review.issues)
      else ReviewOutcome.Fallback(Some(review))
    else
      modelReview match
        case None | Some(Left(_)) =>
          val reason = modelReview.flatMap(_.left.toOption).getOrElse("评审未执行")
          val repairIssues = previousReview.map(_.issues).filter(_.nonEmpty).getOrElse(List(InvalidReviewRepairIssue))
          if budget.revisionsLeft then ReviewOutcome.Revise(invalidReview(reason, previousReview), repairIssues)
          else ReviewOutcome.Fallback(previousReview)
        case Some(Right(review)) =>
          review.verdict match
            case ReviewVerdict.Pass => ReviewOutcome.Passed(review)
            case ReviewVerdict.Revise =>
              if budget.revisionsLeft then ReviewOutcome.Revise(review, review.issues)
              else ReviewOutcome.Fallback(Some(review))

  private def summaryOf(scores: RubricScores, verdict: ReviewVerdict, passScore: Double): String =
    val dimensions = List(
      ("情绪契合", scores.moodMatch, SceneContract.MinMoodMatch),
      ("照片情绪在场感", scores.photoPresence, SceneContract.MinPhotoPresence),
      ("构图", scores.composition, SceneContract.MinComposition),
      ("光线与色彩", scores.lightingColor, SceneContract.MinLightingColor),
      ("完整度", scores.completeness, SceneContract.MinDimensionScore)
    )
    val unmet = dimensions.collect { case (name, score, minimum) if score < minimum => name }
    val conclusion = if verdict == ReviewVerdict.Pass then "通过" else "未通过"
    val score = f"${weightedScore(scores)}%.2f"
    val threshold = BigDecimal.decimal(passScore).bigDecimal.stripTrailingZeros.toPlainString
    val details = if unmet.isEmpty then "各维度达到单项门槛" else "未达单项门槛：" + unmet.mkString("、")
    summarize(s"$conclusion：加权分 $score（通过线 $threshold）；$details。")
  private def summarize(summary: String): String =
    val trimmed = summary.trim
    val text = if trimmed.isEmpty then DefaultSummary else trimmed
    if text.length <= SceneContract.MaxReviewSummaryLength then text
    else text.take(SceneContract.MaxReviewSummaryLength - 1) + "…"
