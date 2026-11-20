package services.scene.utils

/** scene 与前端沙箱共享的契约常量（runtimeVersion 随 ctx 契约变化递增，spec 9.4）。 */
private[scene] object SceneContract:
  val RuntimeVersion = "1"

  /**
   * 父题面 + 子代码生成共用的提示词版本（写入 scene_runs.prompt_version，供生成链路回溯）。
   * v3（2026-10-28 D8）：设计感升级——水面可读表面、建筑 6–10 构件、构图/光影/材质准则、黄金参考 few-shot。
   * v3.1（2026-10-29）：修正提示词自相矛盾（子准则代码上限与 SCENE_CODE_LIMIT_KB 同源、参考片段用法与真实变量名一致、
   * CubeCamera 需手动 update）；题面不合规时带原因重试一次。
   * v3.2（2026-10-30，Auckland live 复盘 SC-04）：参考片段新增 trees（阔叶树 + 选址检查），子准则新增植物条款
   * （树冠不用尖刺三角片、枝干不外露、树不挡门窗、前景草不过高）。
   * v3.3（2026-10-31，Auckland r4 复盘）：建筑必须四面成立（门后有室内、背面有墙/围护），评审改为 4 个环绕视角。
   * v3.4（2026-11-01，展示录制复盘）：主地标优先选常见、好建的结构；照片里罕见的结构（凿进草坡的圆门洞屋）
   * 不硬复刻，换成传达同样氛围的常见元素——硬复刻时代码模型做成了平地上的房子加一团绿顶。
   * v3.5（2026-11-05，WT-06）：照片清单每行带已采用的投稿讲述摘录（「讲述」，≤150 字/条、每张≤2 条、全局≤3000 字，不含署名）；
   * 讲述与图注同为用户数据，只用于理解情绪与记忆，不点名投稿者、不把原文搬进场景文案。
   */
  val PromptVersion = "scene-parent-v3.5"

  /** 父/子生成提示词版本的可读别名（与 [[PromptVersion]] 同值，避免调用点各自硬编码）。 */
  val ScenePromptVersion: String = PromptVersion

  /** 评审提示词版本：只用于提示词元信息与流程日志的可回溯标注，不写入 DB、不改契约。 */
  val SceneReviewPromptVersion = "scene-review-v3.3"

  /** 修复提示词版本：只用于提示词元信息与流程日志的可回溯标注，不写入 DB、不改契约。 */
  val SceneRepairPromptVersion = "scene-repair-v3.2"

  /** 场景自然语言修订提示词版本（阶段 4 / v1.14）：写入修订运行的 prompt_version。 */
  val SceneRevisionPromptVersion = "scene-revise-v1"

  /** 修订指令：去首尾空白后 1–500 个 Unicode 码点（允许换行 U+000A 与制表符 U+0009，拒绝其他控制字符）。 */
  val MaxRevisionInstructionCodePoints = 500

  /** 修订模型请求容量：完整提示词序列化 UTF-8 ≤2 MiB；父代码不静默截断（上限沿用 SCENE_CODE_LIMIT_KB）。 */
  val MaxRevisionPromptBytes: Long = 2L * 1024 * 1024

  val MinPhotoCount = 3
  val MaxHintLength = 80
  /** avoid 条数：设计准则 v3 要求覆盖 5 条设计负面约束 + 照片实体/逐块 Mesh，故扩到 6–8。 */
  val MinAvoidItems = 6
  val MaxAvoidItems = 8
  val MinScenePromptLength = 400
  val MaxScenePromptLength = 2000
  val MaxMoodLength = 60
  val MaxMemoryReadingLength = 160
  val MaxEntranceNarrationLength = 120
  val MinPaletteSize = 3
  val MaxPaletteSize = 5

  /** 主观验收（spec §9.5）：4 张环绕截图（初始 + 90°/180°/270°）、每张 ≤2MB、fps ≥20、issues ≤6、summary ≤200 字。 */
  val CaptureCount = 4
  val MaxCaptureBytes = 2 * 1024 * 1024
  val MinFps = 20.0
  val MaxReviewIssues = 6
  val MaxReviewSummaryLength = 200

  /** 构建阶段崩溃的独立修复次数（不占 SCENE_MAX_REVISIONS 的质量修订额度）。 */
  val MaxBuildRepairs = 1

  /**
   * 判定下限：无单项 <2；moodMatch ≥3、photoPresence ≥3（纯场景语义=照片情绪在场感）；
   * 设计感升级 v3（2026-10-28）：lightingColor ≥3、composition ≥3（用户反馈水面平淡/建筑简陋/无主光）。
   */
  val MinDimensionScore = 2
  val MinMoodMatch = 3
  val MinPhotoPresence = 3
  val MinLightingColor = 3
  val MinComposition = 3
