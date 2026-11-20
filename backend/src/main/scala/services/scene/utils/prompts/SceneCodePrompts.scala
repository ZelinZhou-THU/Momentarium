package services.scene.utils.prompts

import services.scene.objects.SceneBrief
import services.scene.utils.{SceneContract, SceneState}
import services.system.ai.objects.TextPrompt

/**
 * 子智能体代码生成提示词（spec 9.3 / scene-prompt-spec §3.2，2026-10-28 起为「纯场景」语义）：
 * 题面 + 素材说明 + ctx 契约 + 纯程序化示例；只输出一个 function build(ctx)。
 * **不得使用 ctx.photos 纹理、不得创建照片平面/相框/贴图墙**；场景全部由程序化几何与材质构成。
 */
private[scene] object SceneCodePrompts:

  /** 父/子生成提示词版本（与 SceneContract.PromptVersion 同值，写入 scene_runs.prompt_version）。 */
  val Version: String = SceneContract.ScenePromptVersion

  /** 修复提示词版本（仅可回溯标注：写进提示词元信息 + 修复流程日志；不写入 DB/契约）。 */
  val RepairVersion: String = SceneContract.SceneRepairPromptVersion

  private val Temperature = 0.6
  private val RepairTemperature = 0.4

  def generateSceneCode(
    sessionId: String,
    brief: SceneBrief,
    state: SceneState,
    codeLimitKb: Int
  ): TextPrompt =
    TextPrompt(
      sessionId = sessionId,
      instructions = instructions(brief, state, codeLimitKb),
      temperature = Some(Temperature)
    )

  /** 修订提示词（spec §9.6：repairPrompt(code, errors, issues)）：保留题面，针对问题改上一版代码。 */
  def repairSceneCode(
    sessionId: String,
    brief: SceneBrief,
    state: SceneState,
    previousCode: String,
    issues: List[String],
    codeLimitKb: Int
  ): TextPrompt =
    TextPrompt(
      sessionId = sessionId,
      instructions = repairInstructions(brief, state, previousCode, issues, codeLimitKb),
      temperature = Some(RepairTemperature)
    )

  private def repairInstructions(
    brief: SceneBrief,
    state: SceneState,
    previousCode: String,
    issues: List[String],
    codeLimitKb: Int
  ): String =
    val issueLines = issues.zipWithIndex.map { case (issue, index) => s"${index + 1}. $issue" }.mkString("\n")
    s"""【提示词版本】$RepairVersion（内部追溯标注，不改变修复要求与输出形状）
       |
       |你是 Three.js 场景生成子智能体。上一版场景未通过验收，请按验收意见修复它，而不是从头换一个场景。
       |
       |【题面（保持不变）】
       |${brief.scenePrompt}
       |
       |【素材说明（重要）】
       |- 本场景是**纯程序化环境**，三维场景中不得出现任何照片实体：不得创建照片平面、相框、照片墙、贴有照片的方块/卡片，也不得使用 ctx.photos 的纹理或任何照片贴图。
       |- 照片组共 ${state.photos.size} 张，仅用于理解情绪与叙事；场景由程序化几何与材质构成（地形、岩体、建筑、光、雾、粒子等）。
       |
       |【上一版代码】
       |$previousCode
       |
       |【验收未通过的原因（按优先级修复，逐条必须落实）】
       |$issueLines
       |
       |【修订方式（硬性）】
       |- 只改评审点名的元素和它们直接相关的代码；评审没点名的构件、材质、机位和布光保持上一版的写法与参数，不要顺手重写——修订不能让原本合格的部分变差。
       |- 要求"移开/缩小/让出视线"的，优先改位置和尺寸，不要换一种新造型；要求"重做"的元素，有参考片段就按片段的写法替换旧代码。
       |- 改完自查：被点名的问题是否都落实了；门窗、主地标是否仍完整可见；有没有新出现的穿模、悬空或遮挡。
       |
       |${ReferenceSnippets.repairSection(issues, previousCode)}
       |
       |${SceneDesignGuidelines.childRules(codeLimitKb)}
       |
       |【运行时契约（ctx 由宿主注入，runtimeVersion=1）】
       |- ctx.THREE：three.js；ctx.scene / ctx.camera / ctx.renderer
       |- ctx.photos：数组，每项 { id, width, height, aspect, texture }，纹理已加载；**仅由宿主提供以保持契约，代码不得读取/使用其纹理**
       |- ctx.addOrbitControls(opts?)：兜底轨道控制
       |- ctx.onFrame(fn)：每帧回调 fn(dtSeconds)
       |- ctx.setBackground(color)
       |约束：不得使用 ctx.photos 或任何照片贴图；不得创建照片/相框/照片墙；不得 fetch/XHR/WebSocket/import/Worker/eval/new Function；不得访问 document（除 ctx.renderer.domElement）；不得加载任何外部资源；必须设置相机使首屏能看到场景主体与空间纵深；目标 60fps、最低 20fps。
       |
       |【输出要求】
       |只输出修复后的完整 JavaScript 函数源码：`function build(ctx) { ... }`；不要 markdown 围栏、不要 HTML、不要任何解释；代码不超过 $codeLimitKb KB。""".stripMargin

  private def instructions(brief: SceneBrief, state: SceneState, codeLimitKb: Int): String =
    s"""【提示词版本】$Version（父题面 + 子代码生成共用版本，内部追溯标注）
       |
       |你是 Three.js 场景生成子智能体。请严格按父智能体题面，写出一个可运行的**纯程序化场景**函数。
       |
       |【题面】
       |${brief.scenePrompt}
       |
       |【素材说明（重要）】
       |- 本场景是**纯程序化环境**，三维场景中不得出现任何照片实体：不得创建照片平面、相框、照片墙、贴有照片的方块/卡片，也不得使用 ctx.photos 的纹理或任何照片贴图。
       |- 照片组共 ${state.photos.size} 张，仅用于理解情绪与叙事；场景由程序化几何与材质构成（地形、岩体、建筑、光、雾、粒子等）。
       |
       |【运行时契约（ctx 由宿主注入，runtimeVersion=1）】
       |- ctx.THREE：three.js；ctx.scene / ctx.camera / ctx.renderer
       |- ctx.photos：数组，每项 { id, width, height, aspect, texture }，纹理已加载；**仅由宿主提供以保持契约，代码不得读取/使用其纹理**
       |- ctx.addOrbitControls(opts?)：兜底轨道控制
       |- ctx.onFrame(fn)：每帧回调 fn(dtSeconds)
       |- ctx.setBackground(color)
       |约束：不得使用 ctx.photos 或任何照片贴图；不得创建照片/相框/照片墙；不得 fetch/XHR/WebSocket/import/Worker/eval/new Function；不得访问 document（除 ctx.renderer.domElement）；不得加载任何外部资源；必须设置相机使首屏能看到场景主体与空间纵深；目标 60fps、最低 20fps。
       |
       |${SceneDesignGuidelines.childRules(codeLimitKb)}
       |
       |【代码结构建议（先声明、再搭场景、最后动画；不要照抄数值，场景元素以题面为准）】
       |function build(ctx) {
       |  const THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
       |  // 0) 复制需要的参考片段辅助函数（toolkit 在前）
       |  // 1) 构图与机位（fov 45–55、首屏主体 40–60%、前景遮挡 1–3m）
       |  // 2) 天空（渐变穹顶或背景色 + 雾）与布光（暖主光 + 冷环境光 + 冷轮廓光）
       |  // 3) 主要表面：题面写了什么就做什么（地面/地形/湿街/室内地板/水面……）
       |  // 4) 主地标 + 构件（≥6 个可辨认构件，按统一尺寸常量咬合）
       |  // 5) 前景遮挡 + 中景次要素 + 远景剪影
       |  // 6) ctx.addOrbitControls() + ctx.onFrame（调用各片段的 update，环境运动幅度克制）
       |}
       |
       |${ReferenceSnippets.fewShotSection(brief)}
       |
       |【输出要求】
       |只输出一个 JavaScript 函数源码：`function build(ctx) { ... }`；不要 markdown 围栏、不要 HTML、不要任何解释；代码不超过 $codeLimitKb KB。""".stripMargin
