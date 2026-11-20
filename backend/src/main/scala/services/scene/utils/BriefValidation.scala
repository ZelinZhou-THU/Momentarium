package services.scene.utils

import services.scene.objects.SceneBrief

/**
 * 父题面的语义校验（spec 9.2 写作规则的服务端落实）：JSON 能解码不等于题面可用。
 * 返回可直接回灌给父智能体的中文问题列表；空列表表示合规。纯函数，重试与兜底由 SceneGeneration 编排。
 *
 * avoid 覆盖按关键词判断而不是逐字比对，模型换个说法（如「水面纯色、没有纹理」）不算违规，
 * 避免校验过严把本可用的题面推向兜底。
 */
private[scene] object BriefValidation:

  val RequiredSections: List[String] =
    List("【任务】", "【情绪与记忆】", "【照片叙事】", "【场景与空间】", "【光照与色彩】", "【交互与运动】", "【技术与性能】", "【避免】")

  /** D9 五条设计负面约束：每条都必须被 avoid 覆盖（关键词 → 展示给模型的完整写法）。 */
  private val RequiredDesignAvoid: List[(String, String)] =
    List(
      "纯色" -> "水面纯色无纹理",
      "三角屋顶" -> "盒子+三角屋顶的简陋建筑",
      "近黑" -> "近黑无主光",
      "空带" -> "大片空带",
      "球体堆叠" -> "随机球体堆叠"
    )

  /** 照片实体/性能三条：至少覆盖其中 2 条。 */
  private val PhotoAvoidKeywords: List[String] = List("相框", "照片墙", "逐块")
  private val MinPhotoAvoidCovered = 2

  private val HexColor = "^#[0-9A-Fa-f]{6}$".r

  def validate(brief: SceneBrief): List[String] =
    textIssues(brief) ++ sectionIssues(brief.scenePrompt) ++ paletteIssues(brief.palette) ++ avoidIssues(brief.avoid)

  private def textIssues(brief: SceneBrief): List[String] =
    List(
      lengthIssue("mood", brief.mood, 1, SceneContract.MaxMoodLength),
      lengthIssue("memoryReading", brief.memoryReading, 1, SceneContract.MaxMemoryReadingLength),
      lengthIssue("entranceNarration", brief.entranceNarration, 1, SceneContract.MaxEntranceNarrationLength),
      lengthIssue("scenePrompt", brief.scenePrompt, SceneContract.MinScenePromptLength, SceneContract.MaxScenePromptLength)
    ).flatten

  private def lengthIssue(field: String, value: String, min: Int, max: Int): Option[String] =
    val length = value.trim.length
    Option.when(length < min || length > max)(s"$field 长度应为 $min–$max 字，实际 $length 字")

  private def sectionIssues(scenePrompt: String): List[String] =
    RequiredSections.filterNot(scenePrompt.contains) match
      case Nil => Nil
      case missing => List(s"scenePrompt 缺少分节：${missing.mkString("")}")

  private def paletteIssues(palette: List[String]): List[String] =
    val sizeIssue = Option.when(palette.size < SceneContract.MinPaletteSize || palette.size > SceneContract.MaxPaletteSize)(
      s"palette 应为 ${SceneContract.MinPaletteSize}–${SceneContract.MaxPaletteSize} 个颜色，实际 ${palette.size} 个"
    )
    val invalid = palette.filterNot(color => HexColor.matches(color.trim))
    val formatIssue = Option.when(invalid.nonEmpty)(s"palette 必须是 #RRGGBB，不合法：${invalid.mkString("、")}")
    List(sizeIssue, formatIssue).flatten

  private def avoidIssues(avoid: List[String]): List[String] =
    val items = avoid.map(_.trim).filter(_.nonEmpty)
    val joined = items.mkString("；")
    val sizeIssue = Option.when(items.size < SceneContract.MinAvoidItems || items.size > SceneContract.MaxAvoidItems)(
      s"avoid 应为 ${SceneContract.MinAvoidItems}–${SceneContract.MaxAvoidItems} 条，实际 ${items.size} 条"
    )
    val missingDesign = RequiredDesignAvoid.collect { case (keyword, label) if !joined.contains(keyword) => label }
    val designIssue = Option.when(missingDesign.nonEmpty)(s"avoid 缺少设计负面约束：${missingDesign.mkString("、")}")
    val photoCovered = PhotoAvoidKeywords.count(joined.contains)
    val photoIssue = Option.when(photoCovered < MinPhotoAvoidCovered)(
      "avoid 至少要包含「照片直贴或相框陈列」「照片墙与照片漂浮卡片」「逐块 Mesh 导致 fps 崩」中的 2 条"
    )
    List(sizeIssue, designIssue, photoIssue).flatten
