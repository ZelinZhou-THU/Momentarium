# Momentarium 规格说明：AI 数字策展平台 MVP（v0.15.2，1 周交付）

- 状态：v0.15.2，2026-11-05
- v0.15.2 变更（契约 v1.19）：版本历史摘要增加 `dismissed`，已放弃的修订候选在历史里标注「已放弃」，仍可恢复为新运行。
- v0.15.1 变更（契约 v1.18）：放弃修订候选写入服务端，刷新后不再弹出，历史保留且可恢复为新运行；已放弃候选不能直接采用。
- v0.15.0 变更（走查问题第四批，契约 v1.17，只增字段）：①（WT-06）采用的投稿讲述与策展人自己的照片同级，进入策展与场景的 AI 链路——主题建议、对话修订、场景父题面的照片行带「讲述」摘录（清洗、单条 ≤150 字、每张 ≤2 条、全局 ≤3000 字，不含署名，与图注同为用户数据）；视觉分析仍只看画面（缓存不失效）；场景提示词升到 `scene-parent-v3.5`；讲述文字变化（「更新到最新版」）与移除/撤回讲述都递增 `curation_version`、使场景过期；投稿编辑器与邀请页告知「采用后回忆文字会用于 AI 策展与三维场景生成」；②（WT-17）邀请页显示邀请人展示名（`ContributionInvitePreview.inviterName`，创建者资料的 displayName，未设置退回用户名）。详见走查记录 §13。
- v0.14.1 变更（走查问题第三批，契约 v1.16，只增字段）：投稿者在「我参与的」能看到回忆的去向——`ContributionSummary` 增加 `exhibitionPublished`、`memoryPublished`，已采用的卡片说明讲述是否已随展览公开（展览未发布 / 发布在采用之前 / 已公开 / 有待确认修改），展览已发布时给「查看公开展览」链接（`/show/:id`）；投稿编辑器的地点改为「按地名搜索（复用 `searchplaces`，只发送搜索词）→ 点结果填入名称与坐标」，并可选开启在线地图点选（默认不加载，先说明外部依赖），手填坐标仍可用；演示数据脚本 `scripts/demo/seed.ps1` 整套重写（见走查记录 §11）。
- v0.14.0 变更（走查问题第二批，契约 v1.15，只增字段）：创建者能看到待处理投稿——`ExhibitionSummary`/`ExhibitionDetail` 增加 `pendingContributionCount`（已提交且未采用，或已采用后有新版本），展览卡片、统计条与工作台「投稿」页签徽标显示，卡片直达 `?tab=contributions`；采用对话框可选「放进哪个章节」（`AdoptContributionRequest.groupId`，新照片放章节末尾，缺省仍未分组，原地更新忽略）；待确认更新改为并排对照「已采用版本 / 投稿者最新版本」（数据取自草稿详情，无接口变化）；`SceneRunSummary` 增加 `revisionInstruction`，场景版本列表直接显示修订要求；场景过期时旧修订候选禁用「采用」；策展页对没有图注的照片提供「采用 AI 建议」（读记忆档案缓存，不触发模型）。
- v0.13.1 变更（前端导航重构，接口不变）：登录后全站顶栏改为「品牌 + 主导航（我的展览 / 我参与的，并列）+ 用户菜单（账户设置 / 我的作者主页 / 登出）」；原「我的回忆」更名「我参与的」（路由仍为 `/contributions`）；作者主页是公开身份、不再作为展览列表顶栏的入口，收进用户菜单；回忆页与账户页去掉「← 我的展览」返回；品牌固定回 `/exhibitions`，主导航与品牌之间有分隔线、当前项为底色块；`/` 只作为入口分流页（直接输入网址、登录/注册后默认回跳）：有自己的展览去 `/exhibitions`，没有展览但有参与记录去 `/contributions`，都没有去 `/exhibitions`；登录/注册默认回跳改为 `/`。
- v0.13.0 变更（阶段 4 场景自然语言修订，接口新增）：新增 2 条 scene 消息路由 `revisescene`/`acceptscenerun`（消息 49 → 51、非消息仍 8）；`scene.scene_runs` 增加 `kind`（generate/revise/restore）、`parent_run_id`、`revision_instruction` 并回填旧行 kind；`gallery.exhibitions` 增加可空 `current_scene_run_id` 显式指针（独立一次性 JVM 迁移回填旧展览最新成功运行，不挂常规启动、无运行期兜底）；普通生成/恢复成功自动切换指针，修订成功只是候选，`acceptscenerun` 才切指针；`ExhibitionDetail` 区分 `currentSceneRun`（指针）与 `sceneRun`（最新运行），`SceneRunView`/`SceneRunSummary` 增加 kind/parentRunId/revisionInstruction/isCurrent/acceptable；发布、sceneStale、配色、未发布修改、照片档案题面、历史当前标记、恢复幂等均改按指针读取；新增 2 个 400 与 2 个 409 reason；样例 97 → 101。前端工作台场景分区区分当前采用场景/最新任务/未采用候选（§7、§8、§10.6、§11.2；契约 v1.14）。
- v0.10.1 变更（阶段 1.5 契约冻结：作者主页跨展览足迹，接口新增字段）：`getauthorpage` 响应 `AuthorPageView` 增加 `journeyLocations: [AuthorJourneyLocation]`（`exhibitionId`、`exhibitionTitle`、`photoId`、`name`、`latitude`、`longitude`、`granularity`），只聚合作者全部 active 快照中已确认且公开（area/exact）的位置；顺序为展览 `publishedAt` 倒序、同展览内按快照照片顺序，旧快照为 `[]`。作者主页新增只读足迹地图（聚类、点击放大，v1 不做时间/展览过滤）；路由仍 33 条、样例仍 64 份，不新增 reason/错误码（§11.1、§11.2；契约 v1.8）。
- v0.10.0 变更（阶段 1 契约冻结：位置与地图，接口新增）：位置值类型（来源 exif/manual/ai、状态 suggested/confirmed、公开粒度 hidden/area/exact）与 `gallery.photo_locations` 表；新增 3 条消息路由（`setphotolocation` / `clearphotolocation` / `searchplaces`，路由总数 30 → 33）；`ExhibitionDetail` 与 `PublicExhibitionView` 增加 `locations`，发布快照冻结公开位置（旧快照缺字段按空解码）；`hasUnpublishedChanges` 增加公开位置投影维度，位置写入只刷新 `updated_at`、不递增 `curation_version`、不使场景过期；新增错误码 `UPSTREAM_UNAVAILABLE`（503）与 5 个 reason（§7、§11.1、§11.2、§13；契约 v1.7）。已知限制：仅新上传的 JPEG APP1 EXIF GPS 产生建议，PNG/WebP 不产生建议、既有照片不做回填；工作台分区 4 → 5（新增地图分区），公开地图在进入 3D 后展示。
- v0.9.9 变更（场景评审稳健性，接口不变）：11-01 展示录制中三次生成都落兜底，其中两次是评审结构化输出无效、一次是构建错误占掉修订额度。评审解码接受缺失的 verdict/summary（服务端重算）并在多对象输出中取第一个合法对象，结构化重试带上失败原因；评审无效先重评一次，仍无效按"不通过"修订而不直接兜底；构建阶段崩溃使用独立的一次修复额度（`scene_runs.build_repairs`）；被拒代码与原因留存本机。用户决定取消通用兜底题面：题面或代码生成失败时运行直接失败并提示重新生成；结构化调用也改为流式；题面长度上限 1200 → 2000 字；代码大小上限 60KB → 1MB；题面提示词 v3.4：主地标优先常见、好建的结构，照片里罕见的结构换成传达同样氛围的常见元素，不硬复刻；前端评审提交去重键加入 `updatedAt`，构建修复后的评审不再被当作重复提交丢掉（此前页面会一直停在"正在渲染并截图"，需刷新才恢复）。评审标准放宽（评审提示词 v3.3）：此前水面纯色、建筑缺室内、空带等设计感检查各自把维度封顶到 2 分，加上通过线 3.3 高于"全 3 分"的 3.0，11-01 录制中 8 次有效评审无一通过（氛围与在场感恒为 3）；现改为各项命中只扣 1 档、仅近黑/黑屏仍封顶，四面成立只核对主地标，增加"3 分 = 可展示、4 分 = 明显出色"的打分尺度，通过线降为 3.0（`REVIEW_PASS_SCORE`）。（§3、§7、§9）。
- v0.9.8 变更（视觉体验，接口字段扩展、路由不变）：照片 AI 解读（主色、配文、感官描写）随发布冻结进快照，并在看展侧栏与大图中展示；展览相关页面按场景题面主色自动配色（工作台及其子页、看展预览、公开页；列表与作者主页的卡片各自局部配色）；新增页面切换与场景切换动效，动效规则改为两档（§8.3、§11.2、§11.6；契约 v1.5）。
- v0.9.7 变更（新增四个页面，接口 22 → 30 条）：场景版本历史 `/exhibitions/:id/scenes`（列出全部运行、评分与意见、沙箱预览、把旧的成功版本恢复为当前场景）；照片记忆档案 `/exhibitions/:id/insights`（展示已缓存的逐张 AI 解读、整体情绪/色彩/记忆线索，并与最近成功场景的题面对照）；账户设置 `/account`（显示名、简介、作者主页开关、修改密码）；作者主页 `/u/:username`（公开，需作者主动开启；公开页先导页显示作者入口）。新增 `users.profiles` 表与 `scene_runs.restored_from` 列（§7、§8.3、§11.1、§13）。
- v0.9.6 变更（确定性修复，未做 live）：场景当前视角可设封面；仅改封面不增策展版本，保留未发布变化和旧快照；renderKey 限定裸 UUID；静态 WebP 解码与透明图白底缩略图；公开页统一 API 发送；评分摘要由最终评分确定，硬门禁摘要保留诊断，两者与最终结论一致。沙箱 capture 错误增加可选 requestId 关联重试，不升级 runtimeVersion。
- v0.9.5 变更（看展界面氛围，不改接口）：进入场景先出开场字幕（标题 + 入口导语），章节侧栏改两列照片网格并带滑入滑出动画，大图变成按叙事顺序翻看的导览；动效规则新增 500ms 一档（§11.6）。
- v0.9.4 变更（工作台视觉与结构，不改接口）：「AI 灵感」并入策展、悬浮在策展上，分区 5→4；新增作者看展预览 `/exhibitions/:id/view`（展览列表与工作台都有「看展」入口）；配色"浅色做底、深色点缀"，`night` 改为胡桃木棕 `#3A2E26`；三维场景深色舞台与沉浸观看（§11.2、§11.6）。
- v0.9.3 变更（前端体验迭代，不改产品范围）：`SceneRunView` 增加 `createdAt`（前端显示已用时间）；前端轮询不设超时判负（3 分钟后放慢）；工作台"下一步"引导、分区写入网址、未保存策展离开保护与策展长表单改进（§6.6、§11.2，详见文末版本表）。
- v0.9.2 变更（纯场景决策，用户 2026-10-28 看 live 真实渲染后提出"照片直接放里面有点突兀，改成纯场景"）：
  1. 三维场景改为**纯环境**：场景中不出现照片实体（禁止照片平面/相框/照片墙/贴图方块/漂浮卡片）；照片改由照片区、策展区、公开页侧栏与大图/图注查看。DR-13 同步修订。
  2. 硬门禁删除「`runtime.photoIdsUsed` 必须覆盖 run.photoIds」，其余 6 条保留（代码/errors/network/fps/4 张合法 JPEG/归属与状态）。
  3. 子代码提示词删除「必须使用全部 ctx.photos」，明确禁止使用照片纹理与照片实体；父题面与负面约束同步；兜底工件与 Fake 模板改为纯程序化场景。
  4. rubric 五维字段与权重不变（API 形状不变），`photoPresence` 语义改为「照片情绪在场感（不要求照片实体出现，出现照片实体反而扣分）」；通过判定仍含 `photoPresence ≥ 3`。
  5. `docs/api-contract.md` / `docs/scene-prompt-spec.md` / 契约样例仅同步语义与文案，JSON 形状不变。
- v0.9.1 变更（连接池语义）：HikariCP 的 `autoCommit` 由 false 改为 true；多步写（updatecuration、publish、运行状态迁移）必须走 `transaction(connection)(IO)` 显式开启事务，单语句写入天然原子；避免忘记包事务时静默回滚。新增 DR-33。
- v0.9 变更（五维 rubric、reason 码分层、配置与目录说明收敛）：
  1. 场景验收 rubric 明确为**五维**（moodMatch / photoPresence / composition / lightingColor / completeness，权重 0.30/0.25/0.20/0.15/0.10），修正正文中“六维”的旧表述。
  2. `SceneBrief` 的 Scala 定义补 `userHint: Option[String]`，与 §8.5、`scene_runs.hint` 及 `docs/api-contract.md` 对齐。
  3. 通过判定统一为：硬门禁全过 + 加权分 ≥ `REVIEW_PASS_SCORE` 且无单项 < 2 且 `moodMatch ≥ 3` 且 `photoPresence ≥ 3`；`docs/scene-prompt-spec.md` 同步。
  4. reason 码分层：`USERNAME_TAKEN`、`VERSION_CONFLICT` 归 409 `CONFLICT`，其余归 400 `VALIDATION`；§8.6 改为带错误码的固定表，注册与发布路由的错误列同步。
  5. 配置名统一：单次调用看门狗 `AI_WATCHDOG_MS`（默认 30 分钟）、修订次数 `SCENE_MAX_REVISIONS`；`.env.example` 校正并补 `DATA_DIR`。
  6. §12 按 rules 3/4 补 `system/` 额外子目录的存在理由。
  7. 路由总数表述补全：22 条注册路由 + 1 条内部消息 + 6 条非消息路由；`docs/api-contract.md` 对齐本版。
- v0.8 变更（契约样例与契约测试）：
  1. 新增 8.7：`docs/contracts/` 共享 JSON 样例作为前后端的唯一期望值；每条注册路由一对 request/response 样例。
  2. 后端 `ContractFixtureSpec`（解码样例 → 再编码 → 与样例对象等价比较）；前端 Vitest 用同一批样例验证解码层与关键页面。
  3. 工作流：字段变更先改样例与两侧类型，再改实现；`sbt test` 与 `pnpm test` 都必须通过；D1 建骨架，D6 检查 22 条路由全覆盖。
  4. 隐私说明的位置定为 README（照片/截图会发送给模型服务用于分析与评审），界面不常驻展示。
- v0.7 变更（封面、场景氛围提示、公开入口、契约文档）：
  1. 展览封面三选一：自动（第一章第一张）/ 指定照片 / **场景渲染截图**（前端截取画面上传，发布时随快照冻结）。
  2. 生成场景可带一句 ≤80 字的氛围提示（`GenerateSceneRequest.hint`），只作为父智能体题面的参考，不改策展。
  3. 公开链接采用“先导页 → 进入 3D”：先显示封面、标题、入口导语与进入按钮，再全屏沙箱；分享链接用展览 UUID。
  4. 新增 `setcover` 消息与两条封面二进制路由；路由总数 22；字段级契约独立成 `docs/api-contract.md`。
- v0.6 变更（生成时长与取消）：
  1. 单次模型调用看门狗从 10 分钟放宽到 **30 分钟**；**取消整次运行的时限**（不再自动判负），给大型/复杂场景留时间。
  2. 新增 `cancelscene` 路由与工作台“停止生成”按钮：取消后终止 fiber、阻止后续评审与修复调用，状态置 `Cancelled`；已发出的 HTTP 请求尽力中断，不保证服务端不计费。
  3. 移除前端断开 10 分钟自动 `Failed(CLIENT_TIMEOUT)`：运行停留在 `AwaitingCapture`，下次进入可继续渲染或手动停止；服务重启清理保持不变。
- v0.5 变更（发布模型、场景失效、图片与字体、并发）：
  1. **发布模型改为「工作草稿 + 公开发布快照」**：编辑已发布展览只写入工作草稿，公开页仍展示上一份快照；点“更新发布”生成新快照（version+1）并原子切换；可下线（P1）。公开内容唯一来源是 `gallery.publications` 的 active 快照。
  2. **场景过期判定服务端化**：`scene_runs` 记录生成时的 `photo_ids` 与 `curation_version`；`getexhibition` 返回 `sceneStale`；发布校验强制“最新 succeeded 且不 stale”。
  3. **图片管线**：进沙箱前客户端降采样（长边 ≤2048、JPEG 0.82），原图只用于大图查看；缩略图按 EXIF 方向纠正；明确不支持 HEIC。
  4. **字体自托管**：`@fontsource` 的 Noto Serif SC / Noto Sans SC 按 `unicode-range` 分片加载，不依赖 Google Fonts 运行时。
  5. **单人测试阶段不设产品级超时与每日配额**：只保留单次调用看门狗（v0.6 起为 30 分钟）与 429/5xx 重试。
  6. **并发约束写死**：同一展览最多一个活跃 SceneRun（部分唯一索引）；`reviewscene` 条件更新防重复；发布在单事务内完成。
- v0.4.2 变更（视觉与密钥）：新增 11.6 视觉设计系统（“私人记忆档案馆”气质；两族字体、8 色 token、两档圆角、最小组件集、类型定义最小化）；13 节补充 AI 密钥管理（仅 `.env` + ACL，不入库不写日志不下发前端）。
- v0.4.1 变更（模型选型）：AI 统一使用 `deepseek-v4.1-flash`（OpenAI Chat Completions 单协议），文本/题面/代码/视觉分析/截图评审共用同一模型；**视觉能力已由用户确认（2026-10-27）**；MVP 只实现 Chat Completions 适配器；保留 `AI_REVIEW_MODEL` 单独覆盖能力以规避同模型自评偏差；首次真实调用仍做一次冒烟，验证 OpenAI 多模态请求格式与 JSON 模式兼容性（见第 18 节）。
- v0.4 变更摘要（相对 v0.3）：
  1. **AI 接入口径确定**：使用用户已有的 **OpenCode Go** 订阅，基础地址 `https://opencode.ai/inference`；MVP 只用 OpenAI Chat Completions 单协议（Anthropic Messages 仅作为将来更换视觉模型时的备选）；客户端必须带自定义 `User-Agent` 与稳定的 `x-opencode-session` 会话头（见 6.5）。
  2. **明确不使用 Agent Harness 框架**（Pi / DeepSeek Harness / Claude Code 等）：本项目的"智能体"是固定阶段 + 类型化输入输出的编排状态机，不是带文件/命令工具的自由 agent 客户端；沙箱运行时自建（DR-20）。
  3. 术语澄清：本文档中的 **Harness 指浏览器沙箱运行时（SceneRuntime）**，与 OpenCode 语境的 Agent Harness 不是同一概念（正文统一改用 SceneRuntime）。
  4. 开发数据库已就绪：本机 PostgreSQL 18.6（端口 5432），数据库 `momentarium` / `momentarium_test`，应用角色 `momentarium`；凭据在 `.env`（已 gitignore），`.env.example` 提供模板；超级用户口令未写入任何文件。
- 沿用 v0.3 的核心决策：三维场景**自由生成可运行代码 + 沙箱渲染 + 主观（VLM）验收 + 硬门禁 + 兜底工件**；放弃原型库/参数化 DSL。
- 交付目标：7 个日历日内完成可演示、可验收的端到端闭环
- 本文件位置：`docs/specification.md`；实现与契约变更时同步更新（契约先行）
- 相关依据：`AGENTS.md`、`rules.md`（60 条工程结构规则）、`docs/scene-prompt-spec.md`

---

## 1. 产品定义与目标用户

**一句话**：用户上传零散照片，AI 读出这组照片的情绪与记忆，提出策展主题与分组；用户编辑确认后，AI 生成一个可沉浸游览的三维记忆场景，并可发布分享。

**目标用户**：喜欢摄影、旅行、记录生活，希望以更有艺术感的方式保存和分享个人经历的人。

**MVP 只验证一条链路**：上传照片 → AI 理解与策展 → 用户参与编辑 → 生成三维记忆场景 → 预览、调整、发布 → 他人观看。

**关键产品定性**：

- 三维场景表达的是这组照片的**情绪与记忆意境**，不要求与照片内容相似，也不是照片挂墙的展厅。
- **场景为纯环境（2026-10-28 用户决策，取代此前"照片必须出现在场景中"的定性）**：三维场景中**不出现照片实体**（禁止照片平面、相框、照片墙、贴图方块、漂浮卡片）；照片通过工作台照片区/策展区与公开页侧栏、大图与图注查看。
- 场景由子智能体**自由生成可运行代码**，不受原型模板限制；父智能体负责题面与验收，验收允许主观（像人看渲染图一样评审）。

## 2. 术语

| 术语 | 定义 |
|---|---|
| 展览 Exhibition | 用户的独立作品单元，含标题、叙事、章节、照片与三维记忆场景 |
| 照片 Photo | 用户上传的图片文件与其元数据，归属于一个展览 |
| 章节 Group / Chapter | 展览内的叙事分组，含标题、文案、有序照片列表 |
| 策展 Curation | 展览的可编辑内容：标题、总叙事、章节（标题/叙事）、照片顺序与图注 |
| 主题提案 ThemeProposal | AI 输出的一组策展方案，含名称、策展理念、推荐分组 |
| 记忆场景 Scene | 子智能体生成的、可在沙箱中运行的 Three.js 场景代码 |
| SceneBrief | 父智能体输出：对照片情绪的结构化解读 + 建模题面（`scenePrompt`） |
| SceneArtifact | 子智能体产物：一个 `build(ctx)` 场景函数源码 + 元数据（模型、版本、大小） |
| SceneRuntime（沙箱运行时，旧称 Harness） | 宿主提供的浏览器内运行时：注入 three.js、照片纹理、相机/渲染器/交互，执行子智能体生成的 `build(ctx)`；正文中的 Harness 均指它，与 OpenCode 语境的 Agent Harness 无关 |
| Agent Harness | OpenCode 语境中指 Claude Code / Codex / Pi / DeepSeek Harness 这类带文件与命令工具的编码 agent 客户端；本项目**不引入**，见 DR-20 |
| Capture | 沙箱渲染后的截图（JPEG data URL），连同运行时证据回传给后端评审 |
| SceneReview | 父智能体（VLM）的验收结果：五维评分 + 通过/修订 + 问题清单 + 摘要 |
| SceneRun | 一次场景生成运行：`Queued → Generating → AwaitingCapture → Reviewing → Succeeded / Failed / Cancelled` |
| Publication 发布快照 | 公开内容的不可变快照（标题/叙事/章节/照片顺序与图注/场景 runId/入口导语）；同一展览最多一个 active |
| 兜底工件 Fallback | 手写的确定性场景代码（同样走 SceneRuntime 契约），模型全失败时保证可演示 |

## 3. MVP 六项核心能力与验收标准

| # | 能力 | MVP 实现 | 验收 |
|---|---|---|---|
| 1 | 批量上传、缩略图、删除、创建独立展览、选封面 | 多文件 multipart 上传；服务端生成 480px 缩略图；未分组照片先进托盘；展览可建/删/改名；封面三选一（自动 / 指定照片 / 场景渲染截图） | 一次上传 8 张，缩略图可见，删除后列表与策展同步；换封面后列表与公开页生效 |
| 2 | AI 主题识别与策展建议 | VLM 逐图输出情绪、色彩、记忆线索（落库缓存）→ 文本模型输出 2–3 个主题方案（名称、理念、分组），支持用户输入方向 | 8 张照片返回 2–3 个方案，照片全部被覆盖且不重复；方向提示生效 |
| 3 | 可编辑的 AI 策展结果 + 对话修订 | 应用方案生成可编辑草稿；可改标题/叙事/章节/顺序/图注；对话输入修订指令，返回结构化修订提案，用户确认后生效 | 改标题、调整 2 张顺序、改 2 条图注后刷新仍一致；修订指令改变分组或顺序并给出理由 |
| 4 | **自由生成的三维记忆场景** | 父智能体写题面 → 子智能体写 `build(ctx)` 场景代码 → 前端沙箱渲染并截图 → 父智能体（VLM）按 rubric 主观验收 → 不通过则带问题修复（≤2 次）→ 用尽回退兜底工件 | 场景可运行、纯环境无照片实体、情绪与题面一致；评审给出评分与证据；模型故障时兜底可渲染 |
| 5 | 预览、调整名称、发布 | 实时 3D 预览（旋转/缩放/复位）；可改展览名称；可重新生成场景；发布生成公开快照，之后编辑不影响公开版本，更新发布原子切换；公开页“先导页 → 进入 3D”；下线 P1 | 无痕窗口打开公开链接看到先导页并进入场景；编辑草稿后公开页不变；更新发布后公开页切换；从未发布的链接 404；重新生成生效 |
| 6 | 账户与展览持久化 | 注册/登录、会话令牌、我的展览列表、草稿续编、已发布作品回访 | 重启服务后数据仍在；令牌过期返回 401；他人无法读写我的草稿 |

**范围优先级**：P0 = 上表全部；P1 = 多轮对话历史、下线（withdraw）、客户端截图下载、自动漫游相机、公开列表页、评审分数历史；P2 = 服务端无头渲染、多模型并排对比、音频、移动端。

## 4. 明确不做（1 周内）

- 社交互动（点赞、评论、关注）与公开发现流/搜索
- 多用户协作编辑、管理员后台、角色体系（MVP 只有普通用户）；**期中版本允许异步共同投稿**（投稿者提交照片+回忆，创建者审核采用，多人不能直接编辑同一草稿），不属于“协作编辑”
- 图片编辑、视频导出、背景音乐
- 移动端适配与原生 App（桌面浏览器优先）
- **加载外部 3D 资产/HDR/GLTF**（场景必须由代码程序化生成，宿主只提供 three.js 与照片纹理）
- 服务端无头渲染（P2）
- 密码找回、邮箱验证、多语言

## 5. 端到端流程与状态机

### 5.1 主路径

1. 注册/登录 → 获得会话令牌（`Authorization: Bearer <token>`）。
2. 新建展览（草稿）→ 批量上传照片 → 服务端保存原图与缩略图 → 照片进入“未分组托盘”。
3. 点击“AI 生成主题” → 对缺分析的图片逐张调用 VLM（情绪、色彩、记忆线索）→ 文本模型输出 2–3 个主题方案。
4. 用户应用一个方案（或输入自定义方向重新生成）→ 生成章节与照片顺序 → 进入可编辑策展。
5. 用户手动调整标题、叙事、章节、照片顺序、图注；也可输入修订指令，AI 返回新提案，用户确认后覆盖。
6. 进入“记忆场景”：展示 AI 对照片的情绪解读（`memoryReading`）与题面摘要；可选填 ≤80 字氛围提示（只作为题面参考），点击生成。
7. 后端异步生成题面与场景代码；前端轮询到 `AwaitingCapture` 后，在沙箱中渲染并自动截取 2 个视角，连同运行时证据回传 `reviewscene`。
8. 父智能体（VLM）给出五项评分与问题清单：通过 → `Succeeded`；不通过且还有修订次数 → 带问题回灌子智能体重新生成 → 前端重新渲染与回传；用尽 → 使用兜底工件 `Succeeded(source=Fallback)`。
9. 用户首次提交发布：校验草稿（照片、分组、章节、最新场景且不 stale）→ 生成发布快照 `publication` → 公开链接 `/show/{exhibitionId}`。
10. 已发布展览继续编辑：修改（含封面）只写入工作草稿，公开页仍展示上一份快照；点“更新发布”生成新快照并原子切换（version+1）；下线（P1）后公开链接 404。
11. 他人打开公开链接：读取当前 active 快照，入口展示入口导语，进入后在沙箱中渲染快照冻结的场景代码，未登录可游览，无编辑入口。

### 5.2 状态机

- Exhibition（工作草稿）：始终可编辑，没有公开状态；编辑不影响已发布内容
- Publication（发布快照）：`Active → Superseded`（更新发布时旧版本被替换）或 `Active → Withdrawn`（下线，P1）；同一展览任意时刻最多一个 `Active`
- Photo：`Ungrouped → Grouped`，以及 `Draft → Archived`（从草稿移除但被活跃发布快照引用时只归档、不物理删除）
- SceneRun：`Queued → Generating → AwaitingCapture → Reviewing → Succeeded | Failed | Cancelled`；修订时回到 `Generating`；非终态可被用户取消（`Cancelled`）
- `Succeeded.source ∈ {Ai, Fallback}`；`attempts` 记录代码修订次数（初始 0，最多 2）
- 会话令牌：`Valid → Expired`（30 天）

### 5.3 失败路径

| 场景 | 行为 |
|---|---|
| 上传格式/大小/数量超限 | 400 `VALIDATION`，前端逐文件提示 |
| 未登录或令牌过期 | 401 `UNAUTHORIZED`，前端清会话并跳登录 |
| 访问他人草稿/不存在展览 | 404 `NOT_FOUND`（不泄露存在性） |
| 分析阶段模型超时/JSON 不合法 | 重试 1 次；仍失败返回 502 `MODEL_FAILURE`，前端可重试 |
| 代码生成失败/语法错误/运行时异常 | 视为硬门禁失败，带错误回灌修复；用尽后兜底工件 |
| 评审不通过 | 按 issues 回灌修复（≤2 次）；用尽后兜底工件，评审意见保留供用户查看 |
| 用户点击“停止生成” | 终止 fiber，阻止后续评审/修复调用，状态置 `Cancelled`；可重新生成 |
| 前端关闭导致 `AwaitingCapture` 长时间不回调 | 不再自动判负；运行停在 `AwaitingCapture`，下次进入可继续渲染或手动停止；服务重启时清理 |
| 服务重启时有运行中的生成 | 启动时把 `Queued/Generating/AwaitingCapture/Reviewing` 标记为 `Failed(SERVER_RESTARTED)` |
| PostgreSQL 不可用 | 启动失败并输出明确错误；运行期消息 API 返回 500 `INTERNAL`；健康检查独立返回 503 `{status:"error", reason:"DATABASE_UNAVAILABLE"}` |
| 发布时草稿不完整 | 400 `VALIDATION`（reason 见 8.6），草稿与当前公开快照都保持不变 |
| 发布时场景已过期（照片/策展改动后未重新生成） | 400 `VALIDATION`（`SCENE_STALE`），提示重新生成后再发布 |
| 已发布期间编辑 | 只写工作草稿；公开快照不变；UI 显示“有未发布修改” |
| 删除被活跃发布快照引用的照片 | 仅从草稿移除并归档文件，公开快照仍可读取；物理文件清理 P1 |
| 下线（P1） | active 快照置 withdrawn，公开链接 404；草稿保留 |

## 6. 系统架构

### 6.1 服务边界

单 JVM 部署，按业务领域分 4 个逻辑微服务 + 1 个共享基础设施模块；每个服务拥有自己的表（独立 schema）、API 消息、路由注册与私有 utils。

| 服务 | 领域职责 | 拥有的表 | 对外 API 消息 | 依赖 |
|---|---|---|---|---|
| `users` | 账户、密码哈希、会话令牌、可信身份解析 | `users.users`, `users.sessions` | register / login / getcurrentuser / logout；内部 `ResolveSessionMessage` 不注册路由 | 无 |
| `gallery` | 照片文件与元数据、展览草稿、章节与照片编排、发布快照、照片二进制路由 | `gallery.exhibitions`, `gallery.exhibition_groups`, `gallery.exhibition_photos`, `gallery.publications` | createexhibition / listmyexhibitions / getexhibition / updateexhibitionmeta / updatecuration / deletephoto / deleteexhibition / publish / getpublishedexhibition | 无（身份由路由器注入） |
| `curation` | 照片情绪与记忆分析缓存、主题建议、对话修订、AI 调用编排 | `curation.photo_analyses`, `curation.chat_sessions`, `curation.chat_messages` | suggestthemes / refinecuration / getchathistory | gallery 公开表方法、AI 端口 |
| `scene` | 题面生成、场景代码生成与修订、主观验收编排、兜底工件、公开场景供给 | `scene.scene_runs` | generatescene / getscenerun / reviewscene / getpublishedscene | gallery、curation 公开表方法，AI 端口 |
| `system` | 连接池与配置、消息基类与路由器、错误模型、事务、静态资源、启动 | 无业务表 | health、静态文件 | 无 |

**归属规则**：表归其最早出现的服务；跨服务只调用公开 API 消息的 `plan` 或公开 Table 方法；SQL 值、行映射、`private[服务名]` utils 不可跨服务访问。场景产物归 `scene`，发布快照归 `gallery.publications`；`scene` 返回公开场景前通过 `gallery` 公开表方法读取 active 快照中的 `sceneRunId` 与发布状态。

### 6.2 运行形态与配置

- 单 JVM（http4s + Cats Effect），默认端口 `8080`。
- **PostgreSQL 16+**（本机已有 PostgreSQL 18 服务运行在 5432，可用；也可用 Docker 的 `postgres:16-alpine`）。**Docker 不是必须**，`DB_URL` 指向任意可达实例即可。
- 每个服务独占一个 schema（`users` / `gallery` / `curation` / `scene`），SQL 中表名全限定；跨 schema 不建外键（跨服务引用由 API/表方法校验）。
- 开发环境提供两种启动方式（二选一）：
  1. `docker compose up -d`：仓库根 `docker-compose.yml` 起 `postgres:16-alpine`，**宿主端口映射到 5433**（避开本机 5432）：
     `DB_URL=jdbc:postgresql://localhost:5433/momentarium`；
  2. 使用本机实例：创建数据库与角色（需数据库管理员口令），
     `DB_URL=jdbc:postgresql://localhost:5432/momentarium`。
- 连接池：HikariCP（maximumPoolSize 10，`autoCommit=true`）；多步写必须走 `transaction(connection)(IO)`（显式关闭自动提交、commit/rollback 后恢复连接），单语句写入天然原子；`plan(connection)` 使用池中连接。
- 数据访问：`system/db` 提供最小类型化访问层（`Sql.query/queryOne/update` + `RowDecoder[A]`，PreparedStatement 绑定），表函数返回 `IO[T]`；不引入 ORM/doobie（理由见 DR-3）。
- 上传文件目录 `data/uploads/{exhibitionId}/{photoId}.{ext}` 与缩略图 `{photoId}.thumb.jpg`；不提交 git。
- 前端：开发态 Vite `5173` 代理 `/api` 与 `/vendor` 到 `8080`；生产由后端静态托管 `frontend/dist`，单端口演示。
- 环境变量：

| 变量 | 说明 |
|---|---|
| `PORT` | 后端端口，默认 8080 |
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | JDBC 连接串与账号（compose 用 5433；本机实例用 5432） |
| `DATA_DIR` | 上传目录，默认 `data` |
| `AI_MODE` | `live` 或 `fake`（fake 为确定性实现，可无网络完整演示） |
| `AI_BASE_URL` | `https://opencode.ai/inference/go`（**Go 套餐端点基础地址**；客户端再拼 `/openai/v1/chat/completions`，脚本拼 `/v1/models`。缺少 `/go` 会落到 Console 通用**按量付费**端点，套餐额度不计入而直接扣余额） |
| `AI_API_KEY` | OpenCode Console 的 personal API key（Go 订阅）；不入库、不提交 |
| `AI_TEXT_MODEL` / `AI_CODE_MODEL` | 题面生成 / 场景代码生成模型（默认 `deepseek-v4.1-flash`） |
| `AI_VISION_MODEL` / `AI_REVIEW_MODEL` | 照片情绪分析 / 截图评审模型（默认同 `deepseek-v4.1-flash`；`AI_REVIEW_MODEL` 可单独覆盖） |
| `AI_TEXT_PROTOCOL` / `AI_VISION_PROTOCOL` | `openai`（Chat Completions）；MVP 两角色均为 `openai` |
| `AI_USER_AGENT` | 自定义 UA，默认 `Momentarium/0.1`（Go 要求可识别客户端） |
| `AI_STREAM_IDLE_MS` | 场景代码生成走流式（SSE）时允许的最长无数据间隔（毫秒，默认 300000）；超过即按网络失败重试。流式让连接持续有数据，避免被链路按空闲时长清掉 |
| `AI_REASONING_EFFORT` | 所有模型调用的 `reasoning_effort`：low／medium／high／max，默认 max，`off` 不发送。10-30 live 同题 3 轮：max 推理 token 比不带参数多约 36%，无效值无变化；以建模效果优先，等待时长可接受 |
| `AI_WATCHDOG_MS` | 基础设施看门狗（非产品级超时）：**单次模型调用**超过该值标记失败，默认 1800000（30 分钟）；整次运行不设时限，由用户“停止生成”控制 |
| `REVIEW_PASS_SCORE` | 验收通过加权分，默认 3.0（v0.9.9 由 3.3 放宽） |
| `SCENE_MAX_REVISIONS` | 场景代码最大修订次数，默认 2 |
| `SCENE_CODE_LIMIT_KB` | 生成代码大小上限，默认 1024（1MB；v0.9.9 由 60 放宽，修订时代码常超过 60KB） |
| `GEOCODE_MODE` | 地点搜索提供方：`fake`（默认，确定性、不触网）或 `live`；只有 `live` 才调用外部地理编码服务 |
| `GEOCODE_BASE_URL` / `GEOCODE_USER_AGENT` | 地理编码服务地址与应用标识 UA；只允许服务端配置，不接收客户端自定义上游 URL |
| `GEOCODE_TIMEOUT_MS` / `GEOCODE_MIN_INTERVAL_MS` / `GEOCODE_CACHE_SIZE` | 单次请求超时（默认 5000ms）、全应用限流间隔（默认 1000ms，≤1 次/秒）与重复查询缓存容量（默认 128） |
| `VITE_MAP_TILE_URL` / `VITE_MAP_TILE_ATTRIBUTION` / `VITE_MAP_TILE_MIN_ZOOM` / `VITE_MAP_TILE_MAX_ZOOM` | 前端构建期地图瓦片配置：默认 OSM Standard（`https://tile.openstreetmap.org/{z}/{x}/{y}.png`、署名 `© OpenStreetMap contributors`、minZoom 1、maxZoom 19）；署名必须可见，URL 不得携带令牌、照片或回忆（v0.10.0） |
| `CONTRIBUTION_MAX_FILE_MB` / `CONTRIBUTION_MAX_BATCH` | 投稿单文件上限（MiB，默认 15）与单批文件数上限（默认 10）；超限在写文件前拒绝（v0.11.0） |
| `CONTRIBUTION_MAX_PHOTOS_PER_USER` / `CONTRIBUTION_MAX_BYTES_PER_USER` | 每投稿者每展览保留的投稿照片数（默认 20）与字节额度（默认 268435456 = 256 MiB）；容量计入原图/衍生图/未清理旧版本/并发预留（v0.11.0） |
| `CONTRIBUTION_MAX_PHOTOS_PER_EXHIBITION` / `CONTRIBUTION_MAX_BYTES_PER_EXHIBITION` | 每展览保留的投稿照片总数（默认 60）与字节额度（默认 805306368 = 768 MiB）；采用后的草稿照片仍受原有 30 张限制（v0.11.0） |

**地图外部依赖与离线降级（v0.10.0）**：地图瓦片与地点搜索是外部依赖，请求会向提供方暴露访问者 IP 与所浏览区域（搜索还会暴露用户输入的公共地点名称）。地图库与 `leaflet.css` 按需加载，业务布局仍使用 Tailwind；瓦片或搜索不可用时，工作台与公开页降级为位置列表与编辑，不阻断投稿、策展、生成场景与发布；不承诺离线底图。

开发库已就绪（2026-10-27 核对）：PostgreSQL 18.6 @ `localhost:5432`，数据库 `momentarium` 与 `momentarium_test`，应用角色 `momentarium`；`.env` 保存连接串与应用口令（已 gitignore），`.env.example` 为模板；超级用户口令不写入仓库与文档。若改用 Docker，compose 端口为 5433。

单人测试阶段（2026-10-27 决定）不设产品级超时与每日生成配额；只保留 **30 分钟单次调用看门狗**与 429/5xx 重试，避免 fiber 永久挂起。整次运行不设上限，用“停止生成”手动控制；额度耗尽时的降级手段是 `AI_MODE=fake` 与兜底工件。

- 表结构初始化：各服务 `XXTableInitializer` 在启动时执行 `CREATE SCHEMA IF NOT EXISTS`、`CREATE TABLE IF NOT EXISTS`（含索引）；一次性数据迁移使用 `system/migrations/` 的独立入口（不挂常规启动），开发期 destructive 改表仍不通过重建数据库完成。
- 本机环境核对（2026-10-27）：JDK 17、Node 24、pnpm 12.5.1、Docker 29 + Compose v5、PostgreSQL 18 服务运行中；**sbt 未安装**（D1 用 winget/coursier 安装），Scala 3.3.x + sbt 1.x 在 JDK 17 下可用。

### 6.3 消息驱动 API 与信任边界

```scala
// services/system/api/APIMessage.scala
trait APIMessage[Response]:
  def plan(connection: Connection): IO[Response]

/** 需要令牌的消息：路由器解析令牌后以可信 userId 构造实例 */
trait APIWithTokenMessage[Response] extends APIMessage[Response]:
  def userId: UserId

/** 无请求体的消息：请求体为 {} */
trait NoRequestMessage[Response] extends APIMessage[Response]
```

- 路由名统一从消息类型推导：去掉末尾 `Message` 后转小写（`CreateExhibitionMessage -> createexhibition`），前后端共用同一规则。
- 路由器职责固定：分发 → 反序列化请求 → 需要令牌时调用 `ResolveSessionMessage(token).plan(connection)` 得到可信 `userId` → 构造消息 → `plan(connection)` → 序列化。路由器不含业务逻辑。
- 内部 API（`ResolveSessionMessage`）只被路由器调用，不注册到 `routes`，也不生成前端调用文件。
- 错误走 IO 错误通道：业务代码 `IO.raiseError(ApiException(ApiError(...)))`，不用 try/catch；路由器 `.attempt` 后在边界统一序列化错误响应。
- 前端自报 `userId` 一律不可信；业务消息只接收路由器解析出的可信 `userId`。前后端消息在信任边界处允许有意不同。

### 6.4 调用边界

- 合法边界只有两种：公开 API 消息的 `plan(connection)`、公开 Table 方法（返回 `IO[T]`）。
- 不创建只做转发的 Service 层；复杂编排写在 API 的 `plan` 中，或提取为归属服务的私有 utils。
- 例外固定为二进制资源传输：照片上传、照片内容、场景封面上传、封面图下载（4 条，见 8.4、DR-5）。

### 6.5 AI 端口与适配器

```scala
// services/system/ai
trait VisionModel:
  def analyze(image: ImageBytes, prompt: PhotoAnalysisPrompt): IO[PhotoAnalysis]   // AI 边界只传压缩后的字节 + MIME，不带领域 photoId

trait TextModel:
  def structured[A: Decoder](prompt: StructuredPrompt): IO[A]
  def complete(prompt: TextPrompt): IO[String]

trait ReviewModel:
  def review(prompt: ReviewPrompt, captures: List[ImageBytes]): IO[SceneReview]
```

- 实现 `OpenAiChatClient`（`/openai/v1/chat/completions`）承载 `TextModel` / `VisionModel` / `ReviewModel` 三个端口；MVP 只用这一种协议（`AI_TEXT_PROTOCOL` / `AI_VISION_PROTOCOL` 均为 `openai`）；`AnthropicMessagesClient` 只在视觉模型必须更换时按需实现，不提前写空壳。
- 认证：`Authorization: Bearer <AI_API_KEY>`；模型必须来自 OpenCode Go / 付费清单（free-tier 模型在 OpenCode 之外调用返回 403）。
- **OpenCode Go 客户端要求**（文档明确要求，必须遵守）：自定义 `User-Agent`（默认 `Momentarium/0.1`）；每个会话稳定发送 `x-opencode-session`（场景运行用 `runId`，策展对话用 `chatSessionId`，重试与修订沿用同一值）。流量会被监控，避免非 agent 式滥用。
- 模型选型（用户 2026-10-27 确认）：统一 `deepseek-v4.1-flash`，走 OpenAI Chat Completions；文本、题面、代码、照片情绪分析、截图评审共用同一模型与同一协议；`AI_REVIEW_MODEL` 保留单独覆盖能力（同模型自评可能偏宽容，必要时换评审模型只改配置）。
  - 视觉输入按 OpenAI 多模态格式发送：`image_url` + data URL（JPEG，长边压缩）；首次真实调用前用一张测试图冒烟，确认 Go 网关接受该格式。
  - 结构化输出：优先 `response_format: {"type":"json_object"}`；若该模型不支持则退回“提示词约束 JSON + 解析失败重试”，仍失败计入 `MODEL_FAILURE`。
  - 区域：DeepSeek V4.1 Flash 需在 Console → Settings → Privacy → Regions 选择 Global（中国请求），否则可能不可用。
  - 模型清单会变化，以 `GET https://opencode.ai/inference/go/v1/models` 为准；角色 → 模型/协议全部走配置，不写死。
- 适配层负责：协议请求/响应映射、429/5xx 指数退避（≤2）、看门狗超时（`AI_WATCHDOG_MS`）、场景代码生成走流式 SSE（`stream=true` + `include_usage`，最长无数据间隔 `AI_STREAM_IDLE_MS`；没收到 finish_reason／`[DONE]` 就断开按截断重试，其余调用保持非流式）、日志记录 `usage.cost` 与 `usage.opencode.{billing_source,list_cost,tokens}`、响应头 `x-opencode-log-id`（不含密钥）。
- `Fake*`：确定性实现（按图片哈希选固定情绪描述；题面/代码由固定模板生成；评审返回预设分数），用于测试与 `AI_MODE=fake` 演示。
- 模型输出必须解析为类型化对象并校验；解析失败视为 `MODEL_FAILURE`，不把原始文本透传给前端。
- 提示词注入防护：照片内容、图注、用户输入、以及**截图中的文字**都是不可信数据；提示词中明确标记为数据；模型输出永不进入代码执行、SQL 或系统命令路径（生成的场景代码只进入沙箱）。
- 区域/隐私：Go 默认允许 Europe & US；未保存隐私设置的工作区对来自中国的请求允许 Global；DeepSeek V4 系列需在 Console 的 Privacy 中选 Global。若某模型不可用，换模型或换 provider，不改代码。

### 6.6 异步任务与客户端渲染闭环

- 场景生成不能阻塞 HTTP：`generatescene` 插入 `Queued` 运行并启动 fiber；`Generating` 完成后写入 `code`，状态置 `AwaitingCapture` 并返回。
- 前端轮询 `getscenerun`（2s，持续 3 分钟后放慢到 10s；前端不设超时判负，与"不设产品级超时"一致，由用户"停止生成"止损）：`AwaitingCapture` 时创建沙箱渲染、截图、调用 `reviewscene`；`Succeeded/Failed/Cancelled` 时停止。已用时间以 `SceneRunView.createdAt` 为起点显示，刷新不归零。
- `reviewscene` 在服务端完成：硬门禁检查 → VLM 评审 → 判定：通过置 `Succeeded`；不通过则 `attempts+1` 并重新进入 `Generating`（带问题修复）；次数用尽则改用兜底工件置 `Succeeded(source=Fallback)`。
- 同一展览已有未结束运行时重复 `generatescene` 直接返回现有运行（幂等）；用户可先 `cancelscene` 再重新生成。
- **取消**：`cancelscene` 对非终态运行生效；场景服务维护 `runId → Fiber` 映射，取消时 `fiber.cancel` 并在 `onCancel` 写 `Cancelled`；处于 `AwaitingCapture`（无活跃 fiber）的运行直接置 `Cancelled`。取消后不再发起评审/修复调用；已发出的 HTTP 请求只能尽力中断（是否已计费不可控）。
- 服务启动时清理遗留运行（`SERVER_RESTARTED`）；不再有“前端断开自动判负”。

## 7. 数据模型

所有 ID 为 `uuid`；时间 `timestamptz`；枚举存 `text` 字符串；复杂结构用 `jsonb`。表名全限定（schema.table）。

### users

| 表 | 字段 |
|---|---|
| `users.users` | `id uuid PK`、`username text UNIQUE NOT NULL`、`password_hash text NOT NULL`、`created_at timestamptz` |
| `users.sessions` | `token_hash text PK`、`user_id uuid NOT NULL`、`created_at timestamptz`、`expires_at timestamptz`；索引 `user_id` |
| `users.profiles` | `user_id uuid PK REFERENCES users.users(id) ON DELETE CASCADE`、`display_name text NOT NULL`、`bio text NOT NULL`、`homepage_public boolean NOT NULL`、`updated_at timestamptz`；无行时按默认值（显示名=用户名、简介空、主页关闭），已有数据库无需迁移（v0.9.7） |

### gallery

| 表 | 字段 |
|---|---|
| `gallery.exhibitions` | `id uuid PK`、`owner_id uuid NOT NULL`、`title text NOT NULL`、`narrative text NOT NULL DEFAULT ''`、`curation_version int NOT NULL DEFAULT 0`、`cover_kind text NOT NULL DEFAULT 'auto'`（auto/photo/render）、`cover_photo_id uuid NULL`、`cover_storage_key text NULL`、`cover_mime text NULL`、`cover_width int NULL`、`cover_height int NULL`、`current_scene_run_id uuid NULL`（v0.13.0：当前采用场景指针；普通生成/恢复成功自动更新，修订成功不切；`ADD COLUMN IF NOT EXISTS`；旧展览由独立一次性 JVM 迁移回填最新成功运行，不挂启动、无运行期兜底）、`created_at timestamptz`、`updated_at timestamptz`；索引 `owner_id` |
| `gallery.publications` | `id uuid PK`、`exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE`、`version int NOT NULL`、`snapshot_json jsonb NOT NULL`（标题/叙事/章节/照片顺序与图注/封面/场景 runId 与入口导语）、`status text NOT NULL`（active/superseded/withdrawn）、`created_at timestamptz`、`superseded_at timestamptz NULL`；唯一 `(exhibition_id, version)`，部分唯一索引 `(exhibition_id) WHERE status='active'` |
| `gallery.exhibition_groups` | `id uuid PK`、`exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE`、`title text NOT NULL`、`narrative text NOT NULL DEFAULT ''`、`position int NOT NULL`；索引 `exhibition_id` |
| `gallery.exhibition_photos` | `id uuid PK`、`exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE`、`storage_key text NOT NULL`、`thumb_key text NOT NULL`、`original_name text NOT NULL`、`mime text NOT NULL`、`width int`、`height int`、`group_id uuid NULL REFERENCES gallery.exhibition_groups(id) ON DELETE SET NULL`、`position_in_group int NULL`、`caption text NOT NULL DEFAULT ''`、`archived_at timestamptz NULL`（从草稿移除但被活跃快照引用时只归档）、`adopted_from_contribution_id uuid NULL`（内部字段，v0.11.3：由投稿“新建照片”采用创建时写入该投稿 id；已有照片/普通上传为 NULL；不进入任何 API；旧数据按 `photo_memories` 的 `photo.created_at = memory.created_at` 由独立一次性迁移 `BackfillLegacyFields` 幂等回填，不挂启动）、`created_at timestamptz`；索引 `exhibition_id`, `group_id` |
| `gallery.photo_locations` | `photo_id uuid PK REFERENCES gallery.exhibition_photos(id) ON DELETE CASCADE`、`source text NOT NULL`（exif/manual/ai）、`status text NOT NULL`（suggested/confirmed）、`name text NOT NULL DEFAULT ''`、`latitude double precision NULL`、`longitude double precision NULL`、`granularity text NOT NULL DEFAULT 'hidden'`（hidden/area/exact）、`updated_at timestamptz NOT NULL`；无记录=未知；坐标 WGS84 且必须成对；confirmed 的 area/exact 必须有坐标；无额外索引（按主键读写、按展览经 exhibition_photos 连接）。阶段 1 新增（v0.10.0） |
| `gallery.contribution_invites` | `id uuid PK`、`exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE`、`token_hash text NOT NULL UNIQUE`（只存 SHA-256，明文只在创建响应返回一次）、`status text NOT NULL`（active/closed）、`created_by uuid NOT NULL`、`created_at timestamptz NOT NULL`、`closed_at timestamptz NULL`；索引 `exhibition_id`。阶段 2 新增（v0.11.0） |
| `gallery.exhibition_contributors` | `exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE`、`user_id uuid NOT NULL`、`invite_id uuid NULL REFERENCES gallery.contribution_invites(id) ON DELETE SET NULL`、`status text NOT NULL`（active/revoked）、`joined_at timestamptz NOT NULL`、`revoked_at timestamptz NULL`、`updated_at timestamptz NOT NULL`；主键 `(exhibition_id, user_id)`，索引 `user_id`。阶段 2 新增（v0.11.0） |
| `gallery.contributions` | `id uuid PK`、`exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE`、`contributor_id uuid NOT NULL`、`status text NOT NULL`（draft/submitted/declined/withdrawn；不存上传中间态）、`version int NOT NULL DEFAULT 1`、`memory_text text NOT NULL DEFAULT ''`、`suggested_caption text NULL`（建议图注，trim 空为 NULL；v0.11.2）、`original_name`/`mime`/`original_key`/`thumb_key`/`display_key` `text NULL`（draft 可暂未附图；v1.12 起仅历史纯文字/未附图数据为 NULL，新 submitted/declined 必有照片）、`width`/`height int NULL`、`original_bytes`/`derived_bytes bigint NULL`、`location_name text NOT NULL DEFAULT ''`、`latitude`/`longitude double precision NULL`、`location_source text NOT NULL DEFAULT 'manual'`（exif/manual）、`created_at`/`updated_at`/`withdrawn_at`/`declined_at timestamptz`；索引 `(exhibition_id, status)`、`(contributor_id, exhibition_id)`。阶段 2 新增（v0.11.0），阶段 2.5 放宽照片列可空并新增 `declined_at`（v0.11.1），阶段 2.6 新增 `suggested_caption`（v0.11.2），阶段 2.8 起照片为提交前提（列仍可空以兼容 draft/历史数据，v0.12.0）；`ContributionTableInitializer` 用幂等 `ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL` / `ADD COLUMN IF NOT EXISTS` 兼容既有库 |
| `gallery.photo_memories` | `id uuid PK`、`photo_id uuid NOT NULL REFERENCES gallery.exhibition_photos(id) ON DELETE CASCADE`、`contribution_id uuid NOT NULL UNIQUE`（应用层维护；采用后独立于投稿生命周期）、`contributor_user_id uuid NOT NULL`、`contributor_name text NOT NULL`（采用时冻结显示名，回退用户名）、`text text NOT NULL`、`adopted_version int NOT NULL`、`created_at`/`updated_at timestamptz NOT NULL`；索引 `photo_id`。阶段 2 新增（v0.11.0） |

### curation

| 表 | 字段 |
|---|---|
| `curation.photo_analyses` | `photo_id uuid PK`、`description text NOT NULL`、`mood text NOT NULL`、`palette jsonb NOT NULL`、`memory_cues jsonb NOT NULL`、`sensory text NOT NULL`、`suggested_caption text NOT NULL`、`model text NOT NULL`、`analyzed_at timestamptz NOT NULL` |
| `curation.chat_sessions` | `id uuid PK`、`exhibition_id uuid NOT NULL`、`user_id uuid NOT NULL`、`created_at timestamptz`；索引 `(exhibition_id, user_id)` |
| `curation.chat_messages` | `id uuid PK`、`session_id uuid NOT NULL REFERENCES curation.chat_sessions(id) ON DELETE CASCADE`、`role text`（user/assistant）、`content text NOT NULL`、`created_at timestamptz`；索引 `session_id` |
| `curation.photo_location_candidates` | `id uuid PK`、`photo_id uuid NOT NULL`（不建跨 schema 外键，由 API 校验归属）、`name text NOT NULL`、`latitude double precision NULL`、`longitude double precision NULL`、`granularity text NULL`（area/exact；无坐标时为 NULL，仅名称候选）、`reason text NOT NULL`、`model text NOT NULL`、`generated_at timestamptz NOT NULL`；索引 `photo_id`。候选只存草稿侧、不进入公开视图/快照；每次 suggest 在同一事务内替换该照片当前候选集，候选 ID 新生成不复用；确认后候选保留（重跑可替换，已确认 `gallery.photo_locations` 不受影响）。阶段 3 新增（v0.12.1） |

### scene

| 表 | 字段 |
|---|---|
| `scene.scene_runs` | `id uuid PK`、`exhibition_id uuid NOT NULL`、`requested_by uuid NOT NULL`、`status text`（queued/generating/awaiting_capture/reviewing/succeeded/failed/cancelled）、`source text NULL`（ai/fallback）、`kind text NOT NULL DEFAULT 'generate'`（v0.13.0：generate/revise/restore，运行起因；与 source 独立；旧行由独立一次性迁移 `BackfillLegacyFields` 回填 restored_from 非空→restore、其余→generate，重跑不覆盖 revise）、`parent_run_id uuid NULL`（v0.13.0：用户修订的直接父运行）、`revision_instruction text NULL`（v0.13.0：用户修订指令，去首尾空白后 1–500 码点，与 hint 分开）、`hint text NULL`（用户氛围提示）、`photo_ids jsonb NOT NULL`（生成时照片快照）、`curation_version int NOT NULL`（生成时的草稿版本）、`runtime_version text NOT NULL`、`brief_json jsonb NULL`、`code text NULL`、`review_json jsonb NULL`、`runtime_json jsonb NULL`、`attempts int NOT NULL DEFAULT 0`、`prompt_version text NOT NULL`、`error_code text NULL`、`error_message text NULL`、`created_at timestamptz`、`updated_at timestamptz`、`restored_from uuid NULL`（v0.9.7：由版本历史恢复时指向最初那次生成；初始化器用 `ADD COLUMN IF NOT EXISTS` 补列）、`build_repairs int NOT NULL DEFAULT 0`（构建阶段崩溃的独立修复次数，不计入 attempts；同样幂等补列）；索引 `(exhibition_id, created_at)`，部分唯一索引 `(exhibition_id) WHERE status IN ('queued','generating','awaiting_capture','reviewing')` |

**事务要求**：`UpdateCuration`（整体替换章节与照片编排并递增 `curation_version`）、`Publish`（校验 + 快照写入 + 旧 active 置 superseded）、运行状态迁移（含 attempts 递增）必须在单事务内完成（`system/db` 提供 `transaction(connection)(IO[A])`）。

**并发约束**：
- 同一展览最多一个活跃 SceneRun：部分唯一索引 `(exhibition_id) WHERE status IN ('queued','generating','awaiting_capture','reviewing')`。
- `reviewscene` 用条件更新（`WHERE id=? AND status='awaiting_capture'`）推进状态与 attempts；更新不到行返回 `CONFLICT`，避免重复评审双花。
- 任何草稿内容变更（标题/叙事/章节/照片/图注）都递增 `exhibitions.curation_version`，并刷新 `updated_at`；位置与公开粒度变化只刷新 `updated_at`（见下），不递增 `curation_version`。

**阶段 4 当前场景指针回填（v0.13.0）**：常规初始化器只负责建表/补列，不在 gallery 初始化器内访问 scene 私有 SQL；独立一次性 JVM 迁移入口（`services.system.migrations` 新类，`scripts/db/` 脚本通过 `sbt "runMain ..."` 调用）经 gallery/scene 公开 Table 方法逐展览读取最新成功运行并回填 `current_scene_run_id`。在停止写入的升级窗口执行：事务内只填空指针，按原排序选取（created_at 倒序、id 倒序）并核对展览/状态，无成功运行保留空；完成标记与摘要写 `DATA_DIR/migrations/backfill-current-scene-run-ids.json`（不新增系统表），失败可重跑、不覆盖已设置指针；必须在开放修订入口前完成。正式切换后不做运行期“空指针取最新成功”兜底，也不在启动时自动重填。阶段 2.7 的 `adopted_from_contribution_id` 归属回填与 v0.13.0 的 `scene_runs.kind` 回填也走同一独立迁移入口 `BackfillLegacyFields`（`scripts/db/backfill-legacy-fields.ps1`）；常规 `Initializers` 不再执行任何数据回填，只建表/补列并恢复中断运行。

**场景过期（`sceneStale`）**：无当前采用场景（`current_scene_run_id` 为空），或当前运行 `photo_ids` ≠ 当前草稿照片集合，或当前运行 `curation_version` ≠ 当前 `exhibitions.curation_version`；未采用候选不影响该判断（v0.13.0）。过期场景不能发布，但可以继续预览（提示重新生成）。

仅改封面（auto/photo/render）不递增策展版本，不使有效场景过期；封面差异仍参与 `hasUnpublishedChanges`，重新发布前公开快照保持不变。最新成功场景与快照绑定的场景不同（重新生成或由版本历史恢复）同样计入 `hasUnpublishedChanges`（v0.9.7）。发布时一并冻结每张照片的 AI 解读（主色、配文、感官描写，取自照片分析缓存）与所绑定场景题面的主色（v0.9.8）；此前的快照没有这两项，公开读时解读为空、主色为空列表，界面退回默认配色。静态 WebP 进入正常上传/缩略图链路，透明部分生成白底 JPEG 缩略图；动画 WebP 按既有不支持格式错误拒绝。位置与公开粒度变化同样计入 `hasUnpublishedChanges`（只比较公开位置投影，见下）。

**位置（阶段 1，v0.10.0）**：位置属于照片，一照片最多一行；来源 `source`（exif/manual/ai）与确认状态 `status`（suggested/confirmed）分开，`unknown` 用无记录表示。阶段 1 只在**新上传**时本地解析 JPEG APP1 EXIF GPS，写入 `suggested` 行（`source=exif`，名称可为空）；PNG/WebP 不产生建议，既有照片不做回填（回填另开任务），作者可手动标注。作者确认/纠正/手动标注写 `confirmed`（作者改动来源记 `manual`，确认既有建议保留原来源），确认写入要求名称非空。公开粒度 `hidden/area/exact`：默认仅草稿可见，`hidden` 不进公开快照；`area` 公开作者确认的范围代表点，不公开原始精确坐标；`exact` 公开精确点。位置变化只刷新 `exhibitions.updated_at`，不递增 `curation_version`，不使 `sceneStale` 变化。发布时把“照片属于该快照且 confirmed 且非 hidden”的位置冻结为快照 `locations`（数组顺序按快照照片顺序）；旧快照没有该字段时按空解码，公开视图返回空数组。`hasUnpublishedChanges` 的位置维度只比较公开位置投影：快照 `locations` 与当前“快照照片中 confirmed 且非 hidden 的位置”不同即为 true；`suggested` 与 `hidden` 内部变化不计。投稿阶段（阶段 2）复用同一位置值类型，投稿位置写入投稿自己的表/JSON，不写本表。

**跨服务引用**：...`scene.scene_runs.exhibition_id`、`curation.*.exhibition_id` 不建跨 schema 外键，由 API 层校验存在性与归属。

## 8. API 契约

### 8.1 传输约定

- 消息类路由统一：`POST /api/{routeName}`，`Content-Type: application/json`；请求体为对应请求对象的 JSON（无请求消息传 `{}`）。
- 认证头：`Authorization: Bearer <token>`；需要令牌的消息缺失/无效令牌返回 401。
- 成功响应：HTTP 200，直接返回响应对象。
- 失败响应：

```json
{ "error": { "code": "VALIDATION", "message": "展览至少需要 3 张照片", "details": { "reason": "PHOTO_COUNT" } } }
```

- 字段命名统一 `camelCase`；`Option` 序列化为 `null`；时间 ISO-8601；枚举为小写字符串；ID 为字符串 UUID。
- `reviewscene` 携带 base64 截图，请求体按 UTF-8 字节计允许到 12 MiB（12582912 bytes，含 base64 与 JSON）；http4s 在 JSON 解码前有界读取，超限返回 HTTP 400 `BAD_REQUEST`，不依赖 Content-Length。

### 8.2 错误码

| 错误码 | HTTP | 语义 |
|---|---|---|
| `BAD_REQUEST` | 400 | 请求格式错误 |
| `VALIDATION` | 400 | 业务校验失败（`details.reason` 给出稳定原因码） |
| `UNAUTHORIZED` | 401 | 未登录/令牌无效或过期 |
| `FORBIDDEN` | 403 | 已登录但无权操作（MVP 尽量用 404 隐藏存在性） |
| `NOT_FOUND` | 404 | 资源不存在或不可见 |
| `CONFLICT` | 409 | 状态或并发冲突（对非 `AwaitingCapture` 运行回传截图、用户名重复、发布快照并发写） |
| `MODEL_FAILURE` | 502 | 模型调用失败/输出无法解析（已重试） |
| `GENERATION_FAILED` | 500 | 场景生成失败且兜底不可用 |
| `INTERNAL` | 500 | 未预期错误（日志记录，响应不含堆栈） |

### 8.3 消息清单

**users**

| 路由名 | 消息类 | 类别 | 请求 → 响应 | 可能错误 |
|---|---|---|---|---|
| `register` | `RegisterMessage` | 公开 | `RegisterRequest(username, password)` → `AuthResponse` | VALIDATION(USERNAME_INVALID/PASSWORD_WEAK), CONFLICT(USERNAME_TAKEN) |
| `login` | `LoginMessage` | 公开 | `LoginRequest(username, password)` → `AuthResponse` | UNAUTHORIZED |
| `getcurrentuser` | `GetCurrentUserMessage` | 令牌 + 无请求 | `{}` → `UserView` | UNAUTHORIZED |
| `logout` | `LogoutMessage` | 令牌 + 无请求 | `{}` → `EmptyResponse` | UNAUTHORIZED |
| `getmyprofile` | `GetMyProfileMessage` | 令牌 + 无请求 | `{}` → `ProfileView` | UNAUTHORIZED |
| `updatemyprofile` | `UpdateMyProfileMessage` | 令牌 | `(displayName, bio, homepagePublic)` → `ProfileView` | VALIDATION(DISPLAY_NAME_INVALID/BIO_TOO_LONG) |
| `changepassword` | `ChangePasswordMessage` | 令牌 | `(currentPassword, newPassword)` → `AuthResponse` | VALIDATION(PASSWORD_INCORRECT/PASSWORD_WEAK) |
| —（内部） | `ResolveSessionMessage` | 内部，不注册路由 | `rawToken: String` → `SessionView` | UNAUTHORIZED |

**gallery**

| 路由名 | 消息类 | 类别 | 请求 → 响应 | 可能错误 |
|---|---|---|---|---|
| `createexhibition` | `CreateExhibitionMessage` | 令牌 | `CreateExhibitionRequest(title)` → `CreateExhibitionResponse(exhibitionId)` | VALIDATION |
| `listmyexhibitions` | `ListMyExhibitionsMessage` | 令牌 + 无请求 | `{}` → `MyExhibitionsResponse(exhibitions)` | UNAUTHORIZED |
| `getexhibition` | `GetExhibitionMessage` | 令牌 | `GetExhibitionRequest(exhibitionId)` → `ExhibitionDetail` | NOT_FOUND |
| `updateexhibitionmeta` | `UpdateExhibitionMetaMessage` | 令牌 | `(exhibitionId, title, narrative)` → `EmptyResponse` | VALIDATION, NOT_FOUND |
| `updatecuration` | `UpdateCurationMessage` | 令牌 | `(exhibitionId, title, narrative, groups)` → `ExhibitionDetail` | VALIDATION, NOT_FOUND |
| `deletephoto` | `DeletePhotoMessage` | 令牌 | `(photoId)` → `EmptyResponse` | NOT_FOUND, CONFLICT |
| `deleteexhibition` | `DeleteExhibitionMessage` | 令牌 | `(exhibitionId)` → `EmptyResponse` | NOT_FOUND |
| `publish` | `PublishExhibitionMessage` | 令牌 | `(exhibitionId)` → `PublishExhibitionResponse(version, publishedAt)` | VALIDATION, NOT_FOUND, CONFLICT(VERSION_CONFLICT) |
| `getpublishedexhibition` | `GetPublishedExhibitionMessage` | 公开 | `(exhibitionId)` → `PublicExhibitionView` | NOT_FOUND |
| `setcover` | `SetCoverMessage` | 令牌 | `SetCoverRequest(exhibitionId, kind, photoId?, renderKey?)` → `CoverView` | VALIDATION(`INVALID_COVER`), NOT_FOUND |
| `getauthorpage` | `GetAuthorPageMessage` | 公开 | `(username)` → `AuthorPageView` | NOT_FOUND |
| `createcontributioninvite` | `CreateContributionInviteMessage` | 令牌（创建者） | `(exhibitionId)` → `ContributionInviteCreated(inviteId, token, createdAt)` | NOT_FOUND |
| `getcontributionmanagement` | `GetContributionManagementMessage` | 令牌（创建者） | `(exhibitionId)` → `ContributionManagementResponse(invites, participants)` | NOT_FOUND |
| `closecontributioninvite` | `CloseContributionInviteMessage` | 令牌（创建者） | `(exhibitionId, inviteId)` → `ContributionInviteSummary` | NOT_FOUND；已关闭幂等 |
| `getcontributioninvite` | `GetContributionInviteMessage` | 公开（凭令牌） | `(token)` → `ContributionInvitePreview(exhibitionTitle, inviterName, status)` | NOT_FOUND（无效令牌）；关闭返回 200 status=closed |
| `joincontribution` | `JoinContributionMessage` | 令牌 | `(token)` → `ContributionMembershipView` | NOT_FOUND, VALIDATION(CONTRIBUTION_SELF_NOT_ALLOWED), CONFLICT(INVITE_CLOSED/PARTICIPANT_REVOKED)；已 active 幂等 |
| `revokecontributor` | `RevokeContributorMessage` | 令牌（创建者） | `(exhibitionId, contributorId)` → `EmptyResponse` | NOT_FOUND；幂等 |
| `listcontributions` | `ListContributionsMessage` | 令牌 | `(exhibitionId?)` → `ContributionsResponse(contributions)` | NOT_FOUND（非本人展览/非参与者） |
| `createcontribution` | `CreateContributionMessage` | 令牌 | `(exhibitionId, memoryText, suggestedCaption?, location?)` → `ContributionSummary`（只创建 draft） | NOT_FOUND, VALIDATION(CONTRIBUTION_SELF_NOT_ALLOWED/CONTRIBUTION_MEMORY_INVALID/CONTRIBUTION_CAPTION_INVALID/LOCATION_*), CONFLICT(PARTICIPANT_REVOKED) |
| `updatecontribution` | `UpdateContributionMessage` | 令牌 | `(contributionId, memoryText, suggestedCaption?, location?, submit, removePhoto)` → `ContributionSummary` | VALIDATION(CONTRIBUTION_MEMORY_INVALID/CONTRIBUTION_CAPTION_INVALID/CONTRIBUTION_PHOTO_REQUIRED/LOCATION_*), CONFLICT(CONTRIBUTION_WITHDRAWN/PARTICIPANT_REVOKED), NOT_FOUND |
| `declinecontribution` | `DeclineContributionMessage` | 令牌（创建者） | `(contributionId, expectedVersion)` → `ContributionSummary` | NOT_FOUND, CONFLICT(CONTRIBUTION_ALREADY_ADOPTED/CONTRIBUTION_WITHDRAWN/CONTRIBUTION_VERSION_CONFLICT)；同版本重复拒绝幂等 |
| `withdrawcontribution` | `WithdrawContributionMessage` | 令牌 | `(contributionId)` → `EmptyResponse`；同时按 v1.11.1 清理已采用讲述/新建照片 | NOT_FOUND；重复撤回幂等 |
| `adoptcontribution` | `AdoptContributionMessage` | 令牌（创建者） | `(contributionId, expectedVersion, caption?, location?)` → `ContributionAdoptionView`（只新建草稿照片） | VALIDATION(PHOTO_LIMIT/LOCATION_*/CONTRIBUTION_MEMORY_INVALID/CONTRIBUTION_PHOTO_REQUIRED/CONTRIBUTION_CAPTION_INVALID), CONFLICT(CONTRIBUTION_VERSION_CONFLICT/CONTRIBUTION_WITHDRAWN/PARTICIPANT_REVOKED/CONTRIBUTION_ALREADY_ADOPTED/CONTRIBUTION_DECLINED), NOT_FOUND；同版本幂等 |
| `removememory` | `RemoveMemoryMessage` | 令牌（创建者） | `(photoId, memoryId)` → `EmptyResponse`；按 v1.11.1 清理由该投稿新建且无其他讲述的草稿照片 | NOT_FOUND；幂等 |

`publish` 是“提交/更新发布”：首次创建 active 快照；再次调用生成 version+1 并 supersede 旧快照。`getpublishedexhibition` 只读 active 快照，没有 active 就 404；草稿内容不会公开。

**采用生命周期清理（v1.11.1）**：`removeMemory` 与 `withdrawcontribution` 会清理**采用新建**（`adopted_from_contribution_id` 非空或旧数据时间戳 fallback）且移除讲述后无其他讲述的草稿照片（不要求 origin 投稿等于当前投稿，A 新建/B 附言的孤儿也能清理）——被 **active 发布快照**引用时只归档（保留文件与公开可读），否则物理删除 row 与文件（superseded-only 引用不阻止删除）；已有照片目标只删除讲述、保留照片。已 withdrawn 的投稿再次撤回时先补清理遗留 adoption，再幂等返回。清理只作用于草稿并标记未发布修改（删/归档照片按既有语义 `touchDraft`），不改写 publication 行与 snapshot JSON，已发布快照不可变。不新增路由/字段。

**curation**

| 路由名 | 消息类 | 类别 | 请求 → 响应 | 可能错误 |
|---|---|---|---|---|
| `suggestthemes` | `SuggestThemesMessage` | 令牌 | `(exhibitionId, hint: Option[String])` → `ThemeSuggestionsResponse(proposals)` | VALIDATION, MODEL_FAILURE, NOT_FOUND |
| `refinecuration` | `RefineCurationMessage` | 令牌 | `(exhibitionId, instruction)` → `RefineCurationResponse(reply, proposal)` | VALIDATION, MODEL_FAILURE, NOT_FOUND |
| `getchathistory` | `GetChatHistoryMessage` | 令牌 | `(exhibitionId)` → `ChatHistoryResponse(messages)` | NOT_FOUND |
| `getphotoinsights` | `GetPhotoInsightsMessage` | 令牌 | `(exhibitionId)` → `PhotoInsightsResponse(analyses, latestBrief?)` | NOT_FOUND |
| `suggestphotolocation` | `SuggestPhotoLocationMessage` | 令牌（作者） | `(photoId)` → `PhotoLocationCandidatesResponse(photoId, candidates, model?, generatedAt?)` | NOT_FOUND, MODEL_FAILURE（AI/上游失败或候选全部非法） |
| `getphotolocationcandidates` | `GetPhotoLocationCandidatesMessage` | 令牌（作者） | `(photoId)` → `PhotoLocationCandidatesResponse`（不触发 AI） | NOT_FOUND |
| `confirmphotolocationcandidate` | `ConfirmPhotoLocationCandidateMessage` | 令牌（作者） | `(photoId, candidateId, granularity)` → `PhotoLocationView(source=ai, status=confirmed, ...)` | NOT_FOUND, VALIDATION(LOCATION_GRANULARITY_INVALID/LOCATION_COORDINATES_INVALID) |

**scene**

| 路由名 | 消息类 | 类别 | 请求 → 响应 | 可能错误 |
|---|---|---|---|---|
| `generatescene` | `GenerateSceneMessage` | 令牌 | `(exhibitionId, hint: Option[String])` → `SceneRunView` | VALIDATION, NOT_FOUND |
| `getscenerun` | `GetSceneRunMessage` | 令牌 | `(exhibitionId)` → `SceneRunView` | NOT_FOUND |
| `cancelscene` | `CancelSceneMessage` | 令牌 | `(runId)` → `SceneRunView` | NOT_FOUND, CONFLICT |
| `reviewscene` | `ReviewSceneMessage` | 令牌 | `(runId, captures: List[String], runtime: RuntimeEvidence)` → `SceneRunView` | VALIDATION, CONFLICT, MODEL_FAILURE, NOT_FOUND |
| `getpublishedscene` | `GetPublishedSceneMessage` | 公开 | `(exhibitionId)` → `PublishedSceneResponse(code, runtimeVersion, generatedAt)` | NOT_FOUND |
| `listsceneruns` | `ListSceneRunsMessage` | 令牌 | `(exhibitionId)` → `SceneRunHistoryResponse(runs)` | NOT_FOUND |
| `getscenerunbyid` | `GetSceneRunByIdMessage` | 令牌 | `(runId)` → `SceneRunView` | NOT_FOUND |
| `restorescenerun` | `RestoreSceneRunMessage` | 令牌 | `(runId)` → `SceneRunView`（成功同步当前指针） | NOT_FOUND, VALIDATION(SCENE_RUN_NOT_RESTORABLE), CONFLICT(SCENE_RUN_ACTIVE) |
| `revisescene` | `ReviseSceneMessage` | 令牌 | `(parentRunId, instruction)` → `SceneRunView(kind=revise, isCurrent=false)` | NOT_FOUND, VALIDATION(SCENE_INSTRUCTION_INVALID/SCENE_REVISION_TOO_LARGE), CONFLICT(SCENE_RUN_ACTIVE/SCENE_REVISION_STALE), BAD_REQUEST(请求体超过 2 MiB) |
| `acceptscenerun` | `AcceptSceneRunMessage` | 令牌 | `(runId)` → `SceneRunView(isCurrent=true)` | NOT_FOUND, CONFLICT(SCENE_RUN_NOT_ACCEPTABLE/SCENE_REVISION_STALE) |
| `dismissscenerun` | `DismissSceneRunMessage` | 令牌 | `(runId)` → `SceneRunView(dismissed=true)` | NOT_FOUND, CONFLICT(SCENE_RUN_NOT_ACCEPTABLE) |

共 52 条注册路由 + 1 条内部消息 + 8 条非消息路由（见 8.4，SPA fallback 不计入）。接口清单以本节为基准，前后端同一次修改中一起更新；字段级定义见 `docs/api-contract.md`。

### 8.4 非消息路由（唯一的二进制边界）

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/photos/upload` | POST multipart | 字段 `exhibitionId` + 多文件 `files`；需令牌；返回 `UploadPhotosResponse(photos, failures)`（单文件失败不影响整批）；限制：≤15MB/文件、≤30 张/展览、JPEG/PNG/WebP |
| `/api/photos/{photoId}/content?variant=thumb\|full` | GET | 需令牌或照片被 active 发布快照引用；返回图片字节；作者任意状态可读，非作者仅 active 快照（含已归档照片）可读 |
| `/api/exhibitions/{exhibitionId}/cover-render` | POST multipart | 场景渲染截图上传（JPEG/PNG ≤4MB、长边 ≤2048）；需令牌；返回 `CoverRenderUploadResponse(renderKey, width, height)` |
| `/api/exhibitions/{exhibitionId}/cover` | GET | 作者读草稿封面、公开读 active 快照封面；返回图片字节 |
| `/api/contributions/upload` | POST multipart | 字段 `exhibitionId`、可选 `contributionId`（替换单文件）、`files`（创建 ≤10）；需 active 投稿者令牌；返回 `ContributionUploadResponse`；单文件大小/类型失败放 `failures[]`，批量/配额超限在写文件前 400（v0.11.0） |
| `/api/contributions/{contributionId}/content?variant=thumb\|full` | GET | 仅投稿者本人或展览创建者；匿名 401、非本人/创建者或已撤回 404；邀请令牌不参与授权（v0.11.0） |
| `/api/health` | GET | `{"status":"ok"}`，含数据库连通性检查 |
| `/vendor/three.min.js` | GET | 沙箱运行时使用的 three.js UMD 构建（固定版本，见 9.4） |
| 其余 GET 路径 | GET | 生产态返回前端静态资源（SPA fallback 到 index.html） |

上传仅支持 JPEG/PNG/WebP；HEIC 明确不支持（iPhone 需先导出为 JPEG）；缩略图生成必须按 EXIF Orientation 纠正方向，否则手机照片会躺倒。

- **作者态图片的客户端取用**：`/api/photos/{id}/content` 与 `/api/exhibitions/{id}/cover` 需要 `Authorization: Bearer`，而 `<img src>` 无法携带请求头；因此作者态前端必须「带令牌 fetch → `URL.createObjectURL` → `<img src=blob:>`」，组件卸载时 `revokeObjectURL`，由共享 hook 统一实现（列表页与工作台复用）。不得把令牌拼进 query string。公开页（D6，active 快照允许匿名读）才可直接使用 URL。

### 8.5 关键对象结构（摘要）

```text
UserView(id, username, createdAt)
AuthResponse(token, user)
ExhibitionSummary(id, title, photoCount, updatedAt, cover: CoverView, sceneStale, publication: PublicationSummary?, hasUnpublishedChanges)
ExhibitionDetail(id, title, narrative, groups[GroupView], ungroupedPhotos[PhotoView], currentSceneRun?, sceneRun?, sceneStale, cover: CoverView, publication: PublicationSummary?, hasUnpublishedChanges, updatedAt)
CoverView(kind: auto|photo|render, imageUrl, width, height)
SetCoverRequest(exhibitionId, kind: auto|photo|render, photoId?, renderKey?)
GroupView(id, title, narrative, position, photos[PhotoView])
PhotoView(id, originalName, mime, width, height, caption, groupId?, positionInGroup?, contentUrl, thumbUrl, memories[PhotoMemoryView])
PhotoMemoryView(memoryId, text, contributorName)
PublicPhotoView(id, width, height, caption, contentUrl, thumbUrl, reading?, memories[PublicPhotoMemory])
PublicPhotoMemory(text, contributorName)
ExhibitionPhotoInput(photoId, caption)
GroupInput(title, narrative, photos[ExhibitionPhotoInput])
ThemeProposal(name, concept, groups[ProposalGroup(title, photoIds)])
CurationProposal(title, narrative, groups[GroupInput])
RefineCurationResponse(reply, proposal)
SceneBrief(mood, memoryReading, scenePrompt, entranceNarration, palette, avoid, userHint?)
SceneRunView(runId, exhibitionId, status, source?, attempts, kind: generate|revise|restore, parentRunId?, revisionInstruction?, hint?, photoIds, curationVersion, brief?, code?, review?, errorCode?, errorMessage?, isCurrent, dismissed, createdAt, updatedAt)
SceneRunSummary(runId, status, source?, attempts, kind, parentRunId?, hint?, mood?, scores?, weightedScore?, reviewSummary?, errorMessage?, restoredFrom?, isCurrent, acceptable, matchesCurrentDraft, restorable, createdAt)
ReviseSceneRequest(parentRunId, instruction)
AcceptSceneRunRequest(runId)
DismissSceneRunRequest(runId)
RuntimeEvidence(buildMs, fps, errors, photoIdsUsed, networkAttempts)
SceneReview(scores: RubricScores, verdict, issues, summary)
RubricScores(moodMatch, photoPresence, composition, lightingColor, completeness)
PublicationSummary(version, publishedAt)
PublishExhibitionResponse(version, publishedAt)
CoverRenderUploadResponse(renderKey, width, height)
PublishedSceneResponse(code, runtimeVersion, generatedAt)
PublicExhibitionView(id, version, title, narrative, narration, cover: CoverView, groups[PublicGroupView], photos[PublicPhotoView], publishedAt)
PhotoLocationCandidateView(id, name, latitude?, longitude?, granularity: area|exact|null, reason)
PhotoLocationCandidatesResponse(photoId, candidates: [PhotoLocationCandidateView], model?, generatedAt?)
ConfirmPhotoLocationCandidateRequest(photoId, candidateId, granularity: hidden|area|exact)
PhotoLocationView(photoId, source, status, name, latitude?, longitude?, granularity)
ContributionSummary(id, exhibitionId, exhibitionTitle, contributor: ContributorBrief,
                    status: draft|submitted|declined|withdrawn, version, memoryText, suggestedCaption?,
                    location: ContributionLocationView?, file: ContributionFileView?,
                    adoption: ContributionAdoptionView?, hasPendingUpdate, createdAt, updatedAt, withdrawnAt?)
CreateContributionRequest(exhibitionId, memoryText, suggestedCaption?, location: ContributionLocationInput?)
UpdateContributionRequest(contributionId, memoryText, suggestedCaption?, location: ContributionLocationInput?, submit, removePhoto)
DeclineContributionRequest(contributionId, expectedVersion)
ContributionAdoptionView(contributionId, photoId, memoryId, adoptedVersion)
ContributionInvitePreview(exhibitionTitle, inviterName, status)
ContributionManagementResponse(invites[ContributionInviteSummary], participants[ContributorView])
```

前端 `objects/` 中的 TS 类型与上表逐字段同构；`Option[T]` ↔ `T | null`。

### 8.6 校验错误与 reason 码

固定集合，前端按键值分支处理，禁止匹配 `message` 文本；新增 reason 必须两侧同步。`details.reason` 对 400 与 409 都适用。

| reason | 错误码 | 触发 |
|---|---|---|
| `TITLE_REQUIRED` | 400 `VALIDATION` | 标题为空 |
| `PHOTO_COUNT` | 400 `VALIDATION` | 草稿照片少于 3 张 |
| `PHOTO_UNGROUPED` | 400 `VALIDATION` | 存在未分组照片 |
| `GROUP_EMPTY` | 400 `VALIDATION` | 存在空章节 |
| `SCENE_NOT_READY` | 400 `VALIDATION` | 没有当前采用场景（指针为空）；v0.13.0 起按指针 |
| `SCENE_STALE` | 400 `VALIDATION` | 当前采用场景的 photoIds / curationVersion 与当前草稿不一致 |
| `SCENE_INSTRUCTION_INVALID` | 400 `VALIDATION` | 修订指令去首尾空白后非 1–500 码点，或含 NUL 等不允许的控制字符（换行/制表符保留） |
| `SCENE_REVISION_TOO_LARGE` | 400 `VALIDATION` | 父代码/指令/上下文超出模型或配置容量，未发送必定超限的请求 |
| `PHOTO_LIMIT` | 400 `VALIDATION` | 超过 30 张/展览 |
| `UPLOAD_TOO_LARGE` | 400 `VALIDATION` | 上传单文件超限 |
| `UPLOAD_UNSUPPORTED_TYPE` | 400 `VALIDATION` | 上传格式不支持 |
| `INVALID_COVER` | 400 `VALIDATION` | 封面照片不属于该展览，或 renderKey 无效 |
| `COVER_TOO_LARGE` | 400 `VALIDATION` | 场景渲染封面上传超限 |
| `COVER_UNSUPPORTED_TYPE` | 400 `VALIDATION` | 场景渲染封面格式不支持 |
| `USERNAME_INVALID` | 400 `VALIDATION` | 用户名不合规（3–32 字符，字母/数字/下划线） |
| `PASSWORD_WEAK` | 400 `VALIDATION` | 密码强度不足（8–72 字符） |
| `USERNAME_TAKEN` | 409 `CONFLICT` | 用户名已存在 |
| `VERSION_CONFLICT` | 409 `CONFLICT` | 并发更新导致发布快照写入冲突 |
| `SCENE_RUN_ACTIVE` | 409 `CONFLICT` | 同一展览已有活跃场景运行（生成/修订/评审中） |
| `SCENE_REVISION_STALE` | 409 `CONFLICT` | 修订父运行不是当前采用场景，或照片/curationVersion/运行时已变化 |
| `SCENE_RUN_NOT_ACCEPTABLE` | 409 `CONFLICT` | 非修订运行或未成功运行不可采用 |
| `CONTRIBUTION_MEMORY_INVALID` | 400 `VALIDATION` | 投稿回忆为空或超过 1000 码点 |
| `CONTRIBUTION_BATCH_LIMIT` | 400 `VALIDATION` | 投稿单批超过 10 个文件 |
| `CONTRIBUTION_QUOTA_PHOTOS` | 400 `VALIDATION` | 投稿照片数超过每人/每展览额度 |
| `CONTRIBUTION_QUOTA_BYTES` | 400 `VALIDATION` | 投稿字节数超过每人/每展览额度 |
| `CONTRIBUTION_SELF_NOT_ALLOWED` | 400 `VALIDATION` | 创建者加入或投稿自己的展览 |
| `INVITE_CLOSED` | 409 `CONFLICT` | 用已关闭的邀请链接兑换 |
| `PARTICIPANT_REVOKED` | 409 `CONFLICT` | 被撤销的投稿者再次兑换/提交/更新 |
| `CONTRIBUTION_WITHDRAWN` | 409 `CONFLICT` | 采用/更新已撤回的投稿 |
| `CONTRIBUTION_VERSION_CONFLICT` | 409 `CONFLICT` | 采用/拒绝时投稿版本已变化 |
| `CONTRIBUTION_TARGET_CONFLICT` | 409 `CONFLICT` | 历史保留码：v1.12 起不再产生（新请求无 targetPhotoId；历史 adopted 目标仅兼容清理） |
| `CONTRIBUTION_PHOTO_REQUIRED` | 400 `VALIDATION` | 提交/重提时投稿没有照片；或对已提交/已拒绝投稿执行 removePhoto；或采用无照片投稿 |
| `CONTRIBUTION_ALREADY_ADOPTED` | 409 `CONFLICT` | 拒绝已采用的投稿 |
| `CONTRIBUTION_DECLINED` | 409 `CONFLICT` | 采用已被拒绝的投稿 |
| `CONTRIBUTION_CAPTION_INVALID` | 400 `VALIDATION` | 建议图注超过 120 码点或含控制字符 |

### 8.7 契约样例与契约测试

文档不可执行，Scala 与 TS 两侧又是各自手写的类型；用**共享 JSON 样例**把契约变成可执行的期望值。

**目录与命名**

```text
docs/contracts/
  users/    login.request.json  login.response.json  register.*  getcurrentuser.response.json  logout.response.json
  gallery/  createexhibition.*  listmyexhibitions.response.json  getexhibition.*  updateexhibitionmeta.*
            updatecuration.*  deletephoto.*  deleteexhibition.*  publish.*  getpublishedexhibition.*  setcover.*
            getauthorpage.*  setphotolocation.*  clearphotolocation.*  searchplaces.*
            createcontributioninvite.*  getcontributionmanagement.*  closecontributioninvite.*  getcontributioninvite.*
            joincontribution.*  revokecontributor.*  listcontributions.*  updatecontribution.*  withdrawcontribution.*
            adoptcontribution.*  removememory.*  contributionupload.response.json
            createcontribution.*  declinecontribution.*
  curation/ suggestthemes.*  refinecuration.*  getchathistory.*  getphotoinsights.*
            suggestphotolocation.*  getphotolocationcandidates.*  confirmphotolocationcandidate.*
  scene/    generatescene.*  getscenerun.*  cancelscene.*  reviewscene.*  getpublishedscene.*
            listsceneruns.*  getscenerunbyid.*  restorescenerun.*  revisescene.*
            acceptscenerun.*  dismissscenerun.*
```

共 103 份样例（48 request + 55 response），覆盖 52 条消息路由与 3 个二进制对象响应（照片上传、封面渲染上传、投稿上传）；包含修订候选、采用和放弃候选的样例。

- 每条注册路由一对：`<routeName>.request.json` 与 `<routeName>.response.json`；无请求消息只写 response。
- 二进制路由（上传、照片内容、封面、投稿上传/内容）不写字节样例，但对象样例（`UploadPhotosResponse`、`CoverRenderUploadResponse`、`ContributionUploadResponse`）要覆盖。
- 样例使用固定 UUID/时间/URL；不含密钥、真实用户数据；字段顺序无关，比较按对象等价（忽略键顺序、浮点容差）。
- 每条路由至少在一个样例里出现可选字段的 `null` 形态。

**后端 `ContractFixtureSpec`**（每服务一个，参数化）

1. 读取 response 样例，`Decoder[T].decodeJson` 必须成功；
2. 用 `Encoder[T]` 重新编码，与样例做对象等价比较，必须一致（字段名、可空性、枚举、时间格式）；
3. 读取 request 样例，对应 `Decoder` 必须成功。

**前端契约测试（Vitest）**

1. 导入同一份样例，经前端解码层（`parseXxx` 或 zod schema）必须不抛错；
2. 关键页面（展览列表、工作台、场景面板、公开页）用样例渲染 smoke test；
3. 能对 JSON 字面量做编译期 `satisfies` 检查的地方加静态断言。

**执行与失败处理**

- `sbt test` 与 `pnpm test` 都必须通过；D6 联调前先跑契约测试。
- 任何一侧失败都视为契约破坏：先改样例与两侧类型，再改实现；不允许“只改一侧 + 手测通过”。

## 9. 三维记忆场景规格（自由生成 + 沙箱 + 主观验收）

### 9.1 场景定性

- 场景表达的是这组照片的**情绪与记忆意境**，不要求和照片内容相似，也不是照片挂墙的展厅。
- **纯场景（2026-10-28 用户决策）**：三维场景中不出现照片实体（照片平面/相框/照片墙/贴图方块/漂浮卡片一律禁止）；照片在照片区、策展区、公开页侧栏与大图/图注中查看。
- 生成链路：照片情绪分析（VLM）→ 策展主题与章节（文本模型）→ **父智能体**写题面（`SceneBrief.scenePrompt`）→ **子智能体**写可运行的 Three.js 场景代码（`build(ctx)`）→ 前端**沙箱**渲染 → 截图与运行时证据回传 → **父智能体（VLM）主观验收** → 不通过则带问题修订（≤2 次）→ 用尽回退兜底工件。
- 用户可见：`memoryReading`（AI 对照片的情绪解读）、`scenePrompt` 摘要、评审分数与问题清单、重新生成按钮。AI 理解不对可换题面/重新生成。

### 9.2 题面规范（父智能体）

题面写法与依据见 `docs/scene-prompt-spec.md`（提炼自 ArenaGalleri 18 道建模题）。核心要求：

- 分节：`【任务】【情绪与记忆】【照片叙事】【场景与空间】【光照与色彩】【交互与运动】【技术与性能】【避免】`。
- 可指认：主体与层次、构图与首屏、米制尺度、光源方向、色板、材质关键词。
- 可执行：使用 SceneRuntime ctx API；禁止联网/外部资源/DOM 操作；代码上限；性能目标。
- 负面约束 3–5 条（空场景、照片实体/相框/照片墙/照片直贴、UI 遮挡、过曝、贴图冒充 3D、眩晕镜头）。
- 可选用户氛围提示（≤80 字）作为题面参考，不改变策展结构；`SceneBrief.userHint` 记录该提示。
- `SceneBrief` 类型：

```scala
final case class SceneBrief(
  mood: String,               // 情绪一句话，≤60 字
  memoryReading: String,      // 对照片情绪与记忆的解读，≤160 字，展示给用户
  scenePrompt: String,        // 建模题面，400–2000 字（v0.9.9 由 1200 放宽：实测初稿常为 1300 字左右）
  entranceNarration: String,  // 入口导语，≤120 字，公开页展示
  palette: List[String],      // 3–5 个主色（#RRGGBB 字符串，与 api-contract 一致）
  avoid: List[String],        // 负面约束，≤5 条
  userHint: Option[String]    // 用户氛围提示，≤80 字；仅作为题面参考
)
```

### 9.3 场景代码契约（子智能体产物）

- 产物：**一个 JS 函数源码** `function build(ctx) { ... }`（≤ `SCENE_CODE_LIMIT_KB`，默认 1MB），不得包含 HTML、markdown 围栏或外部引用。
- `ctx` 由 SceneRuntime 注入，接口固定（`runtimeVersion = 1`）：

```js
function build(ctx) {
  // ctx.THREE                        three.js（固定版本，见 9.4）
  // ctx.scene / ctx.camera / ctx.renderer
  // ctx.photos: [{ id, width, height, aspect, texture }]   全部照片纹理已加载
  // ctx.addOrbitControls(opts)       兜底交互：旋转/缩放/复位
  // ctx.onFrame(fn)                  每帧回调 fn(dtSeconds)
  // ctx.setBackground(color)         scene.background
}

constraints:
- 不得使用照片纹理，不得创建照片平面/相框/照片墙/贴图墙；ctx.photos 仅为兼容旧运行时提供，生成代码应构建纯环境
- 不得 fetch / XHR / WebSocket / import / Worker / eval / new Function
- 不得访问 document（除 ctx.renderer.domElement）
- 不得加载任何外部资源；所有几何与材质由代码生成
- 必须设置相机，使首屏能看到场景主体与完整构图
- 目标 60fps，最低 20fps；粒子/发光适度
```

- 子智能体提示词包含：题面、照片清单（id/宽高比/图注/章节）、ctx 契约、一个成功示例片段、以及修复时的错误与评审意见。
- 代码只进入沙箱执行，绝不进入业务代码、数据库或系统命令路径（DR-16）。

### 9.4 SceneRuntime 与沙箱安全（宿主侧，非模型生成）

> 术语：本节（以及全文）的 Harness 指浏览器沙箱运行时 SceneRuntime；OpenCode 语境中的 Agent Harness（Pi / DeepSeek Harness 等）是带文件与命令工具的编码客户端，本项目不使用（DR-20）。

- 沙箱：`<iframe sandbox="allow-scripts" srcdoc=...>`；**不给** `allow-same-origin`、`allow-popups`、`allow-forms`、`allow-top-navigation`。iframe 文档为不透明源，读不到应用 cookie/localStorage。
- 内容安全策略（写入 srcdoc 的 `<meta http-equiv="Content-Security-Policy">`）：
  `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none';`
- three.js：固定 `three@0.152.2` 的 UMD 构建（`three.min.js`），由后端 `/vendor/three.min.js` 提供一次、前端缓存字符串并**内联**进 srcdoc（沙箱内无网络请求）；`runtimeVersion` 随破坏性契约变化递增。
- SceneRuntime 职责（我们自己写的 JS）：创建 renderer（antialias、`preserveDrawingBuffer:true`、ACES 色调映射、sRGB 输出）、scene、PerspectiveCamera、纹理加载（照片 ArrayBuffer → Blob URL）、执行 `build(ctx)`、动画循环、错误捕获、运行时统计、截图接口、简化 Orbit 控制。
- 照片传递：父页面用令牌拉取**展示图**（客户端 canvas 降采样到长边 ≤2048、JPEG 0.82）→ `postMessage` transfer ArrayBuffer 给 iframe → iframe 内建 Blob URL 加载纹理（避免跨源污染画布）；原图只用于大图查看，不进沙箱。**纯场景决策后**：仍向 `ctx.photos` 提供纹理以兼容旧代码，但生成代码不得使用。
- 消息协议（父页面 ↔ iframe，均校验 `event.source` 与消息结构）：
  - `init(photos, code)` → iframe 回复 `built` 或 `error`；
  - `capture(views: [{azimuthDeg, elevationDeg}])` → iframe 回复 `captures(images: [JPEG dataURL], runtime)`；
  - 请求和成功回包携带 `runId` / `requestId`；capture 错误回包可选携带原 `requestId`，宿主据此丢弃迟到错误。原有非截图错误仍可省略该字段，保持 runtimeVersion=1。
  - 评审截图取四个环绕视角；封面截图取当前视角一张，与评审请求隔离，不调用 `reviewscene`。封面截图超时可重试，成功场景预览保持挂载。
  - 运行时统计：`buildMs`、平均 `fps`（采样 30 帧）、`errors`、`photoIdsUsed`、`networkAttempts`。
- 限制：build 超时 8s；单次渲染会话 ≤ 90s；截图 4 张（初始视角 + 方位角偏移 90°/180°/270°，JPEG 质量 0.82，宽度 ≤1600px）；会话结束销毁 iframe。
- 证据信任模型：截图与运行时证据由客户端提供，用于 AI 评审与质量判断，不作为授权/安全判据；生成代码本身在沙箱内，其风险由沙箱边界承担（DR-16、DR-17）。

### 9.5 主观验收（父智能体 VLM 评审）

**硬门禁**（服务端校验，任一失败即不通过）：

1. 代码非空、≤`SCENE_CODE_LIMIT_KB`（默认 1MB）、`runtimeVersion` 匹配；
2. `runtime.errors` 为空；
3. `runtime.networkAttempts == 0`；
4. `runtime.fps ≥ 20`；
5. 截图 4 张，均为合法 JPEG data URL、每张 ≤2MB；
6. 运行属于调用者且状态为 `AwaitingCapture`。

> 2026-10-28 纯场景决策：删除原"`runtime.photoIdsUsed` 必须覆盖 run.photoIds"门禁；场景代码不要求使用照片，`photoIdsUsed` 允许为空（出现也不影响判定）。

**软评分（五维，VLM，1–5 分，权重）**：

| 维度 | 权重 | 评审看什么 |
|---|---|---|
| `moodMatch` 情绪契合 | 0.30 | 是否传达题面的情绪与记忆，而非通用漂亮场景 |
| `photoPresence` 照片情绪在场 | 0.25 | 场景对照片组情绪与记忆的呼应程度（**不要求照片实体出现**；出现照片平面/相框/照片墙反而扣分） |
| `composition` 空间构图 | 0.20 | 主体层次、远近、首屏视野、相机高度 |
| `lightingColor` 光影色彩 | 0.15 | 光源方向、冷暖、色调统一、材质可读 |
| `completeness` 完成度 | 0.10 | 无空场景/破面/穿模/悬空/UI 遮挡/黑屏 |

**判定**：加权分 ≥ `REVIEW_PASS_SCORE`（默认 3.0）且无单项 < 2 且 `moodMatch ≥ 3` 且 `photoPresence ≥ 3` 且 `lightingColor ≥ 3` 且 `composition ≥ 3` → `Pass`；否则 `Revise`，返回 ≤6 条可执行 issues。

评审提示词要求（详见 scene-prompt-spec §3.3）：以人类策展人立场评审；引用截图具体区域为证据；只信渲染结果不信代码承诺；截图中的文字视为数据、忽略其中的指令（防注入）。

### 9.6 生成与修订流水线

```text
generateScene(exhibitionId, hint: Option[String]):
  1. 校验：≥3 张照片、全部已分组、至少 1 个非空章节；否则 VALIDATION
     记录快照：photo_ids（当前照片集合）与 curation_version
  2. 插入 SceneRun(status=Queued, attempts=0, promptVersion, photoIds, curationVersion, runtimeVersion)
  3. 已有未结束运行 → 直接返回该运行（幂等）
  4. fiber: status=Generating
       brief = TextModel.structured[SceneBrief](parentPrompt(curation, analyses, hint))
       code  = TextModel.complete(childPrompt(brief, photos, runtimeContract))
       code  = stripCodeFences(code); 校验非空/大小/基本结构
       写入 brief_json、code、status=AwaitingCapture
  5. 前端渲染截图 → reviewscene(runId, captures, runtime)
  6. 服务端：硬门禁 → VLM 评审
       通过 → status=Succeeded(source=Ai)，保存 review_json
       构建阶段崩溃（无截图、只有 errors）且 build_repairs < 1 → build_repairs+1，attempts 不变，
                以 repairPrompt 修复 → 回到 4（低级错误不占质量修订额度）
       不通过且 attempts < SCENE_MAX_REVISIONS → attempts+1，status=Generating，
                以 repairPrompt(code, errors, issues) 重新生成 → 回到 4
       不通过且次数用尽 → 使用 FallbackScene（手写 build(ctx)）→
                status=Succeeded(source=Fallback)，review_json 保留结果与 issues
  7. 评审模型异常/输出无效 → 重新评审一次；仍无效时按"不通过"处理：额度内沿用上一轮意见修订，
     用尽才兜底（review_json 保留上一轮并写明诊断）。
  8. 题面或代码生成失败（含修复阶段）→ Failed(GENERATION_FAILED)，errorMessage 写明原因并提示重新生成；
     不再改用通用兜底题面（与照片无关，做出的场景会误导用户）。兜底场景只用于第 6 步额度用尽。
     所有模型调用（含结构化调用）都走流式 SSE，避免长请求在约 99 秒被链路按空闲断开。
     结构化解码：verdict / summary 由服务端重算，缺失可接受；文本中有多个 JSON 对象时取第一个合法的。
     每轮被拒的代码与裁决原因留存到 DATA_DIR/scene-diagnostics/<runId>/（仅本机复盘，不进接口）。
```

**发布校验（publish）**：草稿需满足 ≥3 张照片、全部已分组、章节非空、存在最新 succeeded 场景且 `sceneStale=false`；发布在单事务内写快照（标题/叙事/章节/照片顺序与图注/场景 runId 与入口导语）并 supersede 旧 active。

**取消语义**：`cancelscene` 对非终态运行生效；场景服务维护 `runId → Fiber` 映射，取消时 `fiber.cancel` 并由 `onCancel` 写 `Cancelled`；`AwaitingCapture`（无活跃 fiber）直接置 `Cancelled`。取消后不再发起评审/修复调用；已发出的模型请求只能尽力中断（HTTP 取消），服务端是否已计费不可控。

兜底工件：约 80 行手写代码，构建纯程序化环境（低多边形地形/建筑剪影 + 雾 + 定向光/环境光 + 粒子 + 缓慢相机），不含照片实体；保证满足全部硬门禁（无网络、可运行、fps ≥ 20）。

### 9.7 前端渲染与交互

- `SceneSandbox` 组件：接收 `code` 与照片列表，组装 srcdoc（three + runtime + code），处理 postMessage、错误、超时、销毁。
- 预览页：初始视角 + Orbit 交互（SceneRuntime 提供的简化轨道控制；若生成代码自行实现相机，则以代码为准，SceneRuntime 控制作为兜底）。
- 照片查看：场景内不出现照片实体；照片在大图/图注侧栏、工作台照片区与策展区查看（公开页侧栏含章节/图注/照片列表）。
- 公开页：同一沙箱渲染；章节/图注侧栏静态展示；未登录可看 active 快照场景。
- 容错：WebGL 不可用显示提示；iframe 崩溃/超时显示重试；生成代码未在 8s 内完成 build → 自动按硬门禁失败回传。

### 9.8 预览图与截图

- 预览 = 浏览器实时渲染；截图仅用于 AI 评审（会话内临时使用，不入库）。
- 客户端可“下载当前视角 PNG”（P1），服务端无头渲染 P2。

## 10. 策展 AI 规格

### 10.1 照片分析（VLM）：情绪与记忆优先

- 输入：单张照片（长边压缩到 1024px）。
- 输出 `PhotoAnalysis(description, mood, palette, memoryCues, sensory, suggestedCaption)`：
  - `mood` ≤20 字；`memoryCues` ≤5 个；`sensory` ≤40 字；`suggestedCaption` ≤30 字；`description` ≤120 字，不虚构画面外内容。
- 并发 4，单张超时 30s，失败重试 1 次；成功写入 `photo_analyses` 缓存。
- 单张失败不中断整批；全部失败才返回 `MODEL_FAILURE`。

### 10.2 主题建议

- 输入：照片分析 + 图注 + 已采用的投稿讲述摘录（v0.15.0，与图注同为用户数据，不含署名）+ 用户方向提示（≤200 字）。
- 输出 2–3 个 `ThemeProposal(name, concept, groups)`；硬约束：覆盖全部照片且不重复、分组 1–4、名称 ≤24 字、理念 ≤120 字。
- 校验失败带错误重试 1 次；仍失败返回 `MODEL_FAILURE`。

### 10.3 对话修订

- 输入：服务端权威策展状态（含已采用的讲述摘录，v0.15.0）+ 最近 6 条对话 + 用户指令。
- 输出 `RefineCurationResponse(reply, proposal)`；`reply` ≤200 字；proposal 结构同 `UpdateCuration`。
- proposal 只能使用现有 photoId；不合法重试 1 次后 `MODEL_FAILURE`。
- 保存消息；用户点“应用”才写库（AI 不直接写业务数据）。

### 10.4 成本与并发（单人测试阶段不设配额）

- 分析缓存；主题建议 ≤2 次模型调用；修订 ≤2 次；场景生成 ≤1 次题面 + (1 + `SCENE_MAX_REVISIONS`) 次代码 + 每次评审 1 次 VLM。
- 不设用户级每日配额与产品级超时（2026-10-27 决定）；仅保留内部并发信号量（场景生成 2、分析 4）与看门狗，防止打爆本机或模型额度。
- 额度耗尽/模型不可用时：降级 `AI_MODE=fake` 或兜底工件，演示不阻塞。

### 10.5 地点候选（LocationModel）

- 独立 `LocationModel` 端口：输入一张**去元数据/重编码后的展示图**，不使用 `TextModel`/`VisionModel.analyze` 的输出作为地点来源；提示词版本 `photo-location-v1`。AI 输入不携带 photoId、业务 ID、token、照片元数据或已确认私密位置。
- 输出最多 3 条候选（服务端上限 5 条）；只输出可辨识的地点，无法判断返回空数组；不编造坐标/理由。候选不是置信度校准结果，仅作作者参考。
- 服务端逐条校验：`name` 1–120 码点；`reason` 1–200 码点；坐标成对、有限、WGS84，有坐标时 `granularity ∈ area|exact`；无坐标时候选只保留名称（坐标与 granularity 为 `null`）。非法候选丢弃，最多保留 5 条；至少一条合法即成功，全部非法返回 `MODEL_FAILURE`。
- `AI_MODE=fake` 提供确定性多候选/无候选样例；测试可注入失败实现；AI/上游失败按既有 `MODEL_FAILURE`（502）语义，不写候选。
- 重跑只替换 `curation.photo_location_candidates` 当前候选集，不覆盖 `gallery.photo_locations` 已确认位置；候选不进入公开视图或发布快照。成本：单张一次小图 VLM 调用，无额外配额。

### 10.6 场景自然语言修订（ReviseSceneModel）

- 独立修订提示词 `scene-revise-v1`：以父运行代码、父题面与用户指令为输入，要求只修改用户点名的元素及其直接依赖，保留其他构图、材质与机位；不向用户承诺严格局部修改，输出仍走既有代码校验、沙箱执行与评审。
- 指令去首尾空白后 1–500 个 Unicode 码点，允许中文、换行与常规标点；拒绝 NUL 等控制字符，保留换行（U+000A）与制表符（U+0009）。两侧一致计数。
- 用户指令、父代码、题面作为明确分隔的不可信数据，不允许改写系统约束；分隔不是安全保证，输出仍依赖既有代码校验/沙箱/评审。
- 父代码不得静默截断（配置代码上限，默认 1 MiB）；完整请求单独限制容量（默认 2 MiB 序列化 UTF-8），检查重复嵌入/转义/参考片段；模型端口按提供方上下文与预留输出 token 检查完整输入，无精确计数器时保守估算，无法容纳返回 `SCENE_REVISION_TOO_LARGE`，不发送必超限请求、不悄悄改为从头生成。
- fake 提供确定性成功、评审修复、失败样例，保留父版本关联并覆盖“候选不自动采用”；不只返回与父代码无关的通用结果。
- 修订运行复用现有异步 fiber、状态机、截图评审、取消/失败与同一展览单活跃运行约束；修订成功不自动切当前指针，由 `acceptscenerun` 采用，原父运行代码与评审不被覆盖。

## 11. 前端信息架构与页面拆分

### 11.1 路由

| 路径 | 页面 | 权限 |
|---|---|---|
| `/login`, `/register` | 登录、注册 | 公开 |
| `/` | 首页分流：按是否有自己的展览/参与记录跳到 `/exhibitions` 或 `/contributions`，不展示内容（v0.13.1） | 登录 |
| `/exhibitions` | 我的展览（草稿/已发布） | 登录 |
| `/exhibitions/:id` | 展览工作台（上传/策展/投稿审阅/地图/生成场景/发布；工作台分区 4 → 6） | 作者 |
| `/invite/:token` | 邀请加入页：只显示展览标题、邀请人展示名与邀请状态（v0.15.0 起显示邀请人）；登录后兑换加入；文案“写下一段回忆并附一张照片”；不显示封面/照片/讲述/位置/成员（v0.11.0；v0.12.0 文案） | 公开（凭令牌） |
| `/contributions` | 我参与的（原“我的回忆”，v0.13.1；投稿）：以写回忆并附一张照片为主；保存草稿可暂缺照片，提交前必须附图；支持保存草稿/提交、附加或替换照片、编辑地点、撤回；显示已提交/已采用/待确认/未被采用（可编辑重提）/已撤回/参与被撤销；历史纯文字标注“历史纯文字回忆”（v0.11.0；v0.12.0 照片必填） | 登录 |
| `/exhibitions/:id/view` | 看展预览：与公开页同一套先导页与全屏 3D，内容是当前草稿 + 最近一次通过评审的场景，未发布也能看（v0.9.4） | 作者 |
| `/exhibitions/:id/scenes` | 场景版本历史：全部运行的状态、来源、评分与意见，沙箱预览，把旧的成功版本恢复为当前场景（v0.9.7） | 作者 |
| `/exhibitions/:id/insights` | 照片记忆档案：逐张 AI 解读（情绪/描述/主色/记忆线索/建议图注）、整体汇总、与最近成功场景题面的对照；只读缓存，不触发模型调用（v0.9.7） | 作者 |
| `/account` | 账户设置：显示名、简介、作者主页开关、修改密码（改后其它设备下线）（v0.9.7） | 登录 |
| `/show/:id` | 公开记忆场景（先导页：封面/标题/入口导语/进入 → 全屏沙箱 3D；进入 3D 后展示只读地图，仅 active 快照中已确认且公开的位置；照片大图按署名逐条展示已采用讲述；作者开启主页时显示作者入口）（v0.11.0） | 公开，仅 active 快照 |
| `/u/:username` | 作者主页：公开资料 + 全部已发布展览 + 跨展览足迹地图（只读、聚类；作者在账户设置中开启后才可访问，否则与用户不存在同一 404）（v0.9.7；足迹地图 v0.10.1） | 公开 |
| `/` | 重定向到 `/exhibitions`（未登录跳 `/login`） | — |

地图是现有页面内的业务区域（工作台新增分区、公开页在进入 3D 后展示），不新增页面路径；地图库与样式按需加载，样式例外仅限 `leaflet.css`（v0.10.0）。共同投稿新增两个页面路径（邀请页、我的投稿）与工作台第 6 个分区「投稿」；公开页只读快照，不新增投稿读取接口（v0.11.0）。

### 11.2 工作台页面拆分（复杂页面，按业务区域）

```text
pages/Workspace/
  index.tsx                     # 骨架：页头（标题 + 深色"下一步"卡片）+ 吸顶分区 tab + 各区域；
                                #   网址 ?tab=（照片/策展/投稿/地图/三维场景/发布）与 ?view=immersive（场景沉浸观看）
  hooks/useExhibitionWorkspace.ts   # 展览详情加载与刷新（已就绪时刷新不卸载页面）
  hooks/useCurationDraft.ts         # 策展草稿编辑；有未保存修改时详情刷新只做对齐（rebase）
  hooks/useUnsavedChangesGuard.ts   # 未保存策展离开保护（站内换页确认框 + beforeunload）
  objects/WorkspaceTypes.ts
  functions/buildCurationDraft.ts
  functions/buildWorkspaceNextStep.ts  # 按进度推断下一步与默认分区（与发布校验同源；无章节时打开 AI 灵感）
  functions/workspaceTabs.ts           # 六个分区、徽标、网址参数读写（分区 + 沉浸观看）
  components/
    PhotoPanel/       # 上传、封面选择（自动/照片/场景截图）、深色照片墙（按章节、查看大图、删除）
    CurationPanel/    # 章节目录、章节（可收起、可上移下移）、照片顺序、图注编辑、底部吸附保存栏（有未保存修改时转深色）
    ContributionPanel/ # 投稿分区（v0.11.0）：邀请管理（创建/复制链接/关闭）、参与者列表与撤销、投稿审阅（待审/待确认更新）、
                      #   详情预览与采用（v0.12.0 起只新建草稿照片、确认位置与公开粒度）、已采用记忆的移除
    MapPanel/         # 地图分区（v0.10.0）：Leaflet 懒加载、照片定位与标记、落点/地点搜索、位置编辑（推测/已确认）与公开粒度；
                      #   v0.12.1 增加 AI 地点候选（识别按钮、候选列表与逐条确认，见 §11.2）
    AiInspirationPanel  # 悬浮在策展上的「AI 灵感」：收起是右下角小卡片（显示状态），展开原地变成可滚动面板，
                        #   不改变策展版面；收起只隐藏不卸载；应用提案后策展顶部提示来源与章节数
    ThemePanel/       # 主题提案、自定义方向、应用（在 AI 灵感面板内）
    ChatPanel/        # 修订指令与历史、提案应用（在 AI 灵感面板内）
    ScenePanel/       # 深色舞台（沙箱预览 / 进度 / 待渲染提示）、沉浸观看、氛围提示、生成、轮询与已用时间/修订轮次、
                      #   停止生成、评审结果、重新生成、设为封面；v0.13.0 区分当前采用场景 / 最新任务 / 未采用修订候选，
                      #   当前场景可输入 1–500 字修订指令生成候选，候选可预览/采用/丢弃/继续修订
    PublishBar/       # 发布校验与发布（首次发布 / 更新发布；下线为 P1，界面上不放占位按钮）
```

`PhotoPanel`、`CurationPanel`、`ContributionPanel`、`MapPanel`、`ScenePanel` 为复杂区域，允许各自拥有 `components/` 与 `hooks/`；`AiInspirationPanel`、`ThemePanel`、`ChatPanel`、`PublishBar` 保持单文件组件（rules 46/47）。

**场景修订与采用（v0.13.0）**：

- 工作台场景分区同时展示三类状态：**当前采用场景**（`currentSceneRun`）、**最新任务**（`sceneRun`，进行中/失败/候选）、**未采用修订候选**（`kind=revise` 且 `isCurrent=false`）；三者不混用。当前场景预览读 `currentSceneRun`；候选预览显式使用候选的运行/配色，不把最新运行当当前。
- 当前场景可输入 1–500 字自然语言指令并生成修订候选；生成中/评审中展示进度与已用时间，忙碌时提示已有任务，不静默复用其他指令。候选完成后可预览、采用或丢弃/继续修订；采用前原场景与公开页不变，采用后仍需“更新发布”才改变公开页；失败/取消可重试，过期（父版本/素材变化）提示基于最新当前场景重新修订。
- 场景历史列表标记当前（服务端 `isCurrent`）、候选可采用（`acceptable`）、可恢复（`restorable`）；采用与恢复只依据服务端资格字段，不从当前选中项推断。丢弃候选只需清空本地候选展示（不新增删除路由）；同展览最多一个活跃运行。
- 状态建模：当前场景、最新任务、候选分别用判别联合（`loading|ready|empty|error` + 生成中/候选/采用中），不自动轮询候选、不在打开面板时自动生成；提交修订与采用动作互斥，采用成功刷新详情与历史。

**三维场景沉浸观看**（v0.9.4）：

- 只在场景评审通过、沙箱正在预览时可进入（舞台右下角「沉浸观看」）；生成、截图、评审期间留在页内舞台——截图取画布实际像素，全屏会超过 §9.4 的 1600px 宽度门禁，进度信息也在页内。
- 页内舞台与全屏是**同一个元素**切换样式（`fixed inset-0`），沙箱 iframe 不重挂、场景不重载。
- 覆盖层：顶部「返回工作台」+ 展览标题 + 场景说明（来源 · 修订轮次 · 评审结论）；底部操作提示 +「重新生成」+ 流程走到发布时的「发布展览 / 更新发布」。只有按钮接收指针，拖动与滚轮留给场景。
- 进入时压入一条历史记录（`?view=immersive`），退出方式：「返回工作台」、Esc、浏览器后退；刷新后按网址恢复。鼠标点进场景后焦点在跨源 iframe 里，Esc 传不到页面，所以返回按钮始终可见。
- 在沉浸层点「重新生成」先退出再生成；点「发布」直接切到发布分区。进入时锁定页面滚动并把焦点交给返回按钮，退出后焦点回到「沉浸观看」。
- 操作方式不变（拖动旋转、滚轮缩放），不做第一人称行走。

**看展界面的叙事与动效**（v0.9.5，公开页与看展预览共用）：

- 开场字幕：进入后先看到展览标题与入口导语（衬线字体、一条细分隔线），搭建中提示"正在搭建三维场景"，搭好后换成操作提示；场景再快也至少停留 3 秒，随后 500ms 渐隐露出场景。搭建失败时不显示字幕，直接给重试。
- 章节侧栏：顶部是展览叙事；每章是「第 N 章 / 章节标题 / 章节叙事 / 两列照片网格」，每张照片下是它的主色色条与一行文字（AI 配文优先，没有时用作者图注；v0.9.8），各章逐项上浮进场。宽屏是贴右侧的整列（320px，顶部让出标题栏），窄屏从底部升起（45% 屏高；平板宽度四列）；侧栏与背景同为 `night`，没有悬浮卡片的生硬边缘。**打开时场景让出这块区域**（画布缩小、重新取景，不遮挡），收起时场景铺满。收放用位移 + 渐隐 250ms，收起后 `inert`，窄屏默认收起。
- 大图导览：显示"第 N 章 · 标题"与主文字（作者图注 → AI 配文 → 章节叙事），其下是 AI 配文与感官描写（与主文字重复的不再显示）和这张照片的主色（v0.9.8）；顺序为各章顺序，场景里出现但未分章的照片排在最后；左右按钮或 ←/→ 翻看，Esc 关闭。打开时由侧栏缩略图放大过去、关闭时缩回，翻页时新照片从翻页方向滑入。
- 进入与退出场景：整页向前推进——先导页放大约 6% 并淡出（400ms），场景由 94% 放大淡入（500ms），退出时反向（v0.9.8）。
- 公开页和看展预览两者的差别仍只在 `ShowPresentation`。

公开页单独拆（先导页 → 沙箱）：

```text
pages/PublicShow/
  index.tsx              # PublicShowPage（/show/:id）与 DraftPreviewShowPage（/exhibitions/:id/view）共用的阶段切换
  components/
    IntroGate.tsx        # 封面、标题、入口导语、进入按钮（外框文案来自 ShowPresentation）
    SceneView.tsx        # 复用 scene/ 的沙箱容器
    PublicMapPanel.tsx   # 进入 3D 后的只读地图（v0.10.0）：仅 active 快照中已确认且公开的位置标记；点击标记看照片、点击照片定位地图
    OpeningCurtain.tsx   # 开场字幕：盖住场景搭建的等待，展示标题与入口导语，搭好且停留 ≥3s 后渐隐
    ChapterSidebar.tsx   # 章节侧栏：展览叙事 + 各章照片网格；常驻挂载，位移 + 渐隐收放（收起时 inert）
    PhotoLightbox.tsx    # 大图 + 章节标签 + 图注 + AI 配文与主色 + 已采用讲述（按署名逐条，v0.11.0），可按叙事顺序翻看（按钮或 ←/→）
    PublicShowStatus.tsx # 加载 / 未发布 / 出错 / 预览不可用
  objects/ShowPresentation.ts      # 公开与预览只在这里不同：顶部小字、版本说明、右上标签、提醒、返回入口
  objects/PreviewLocationState.ts  # 跳转携带的返回位置（来自展览列表或工作台某个分区）
  objects/ShowStop.ts              # 导览中的一站：照片 + 章节标签 + 要展示的文字
  functions/buildShowStops.ts      # 展览 → 按叙事顺序排列的导览站点（章节内照片在前，场景里的未分组照片在后）
  functions/buildDraftPreview.ts   # 草稿 → 看展视图（与公开视图同构）、能否预览、两种外框文案
  hooks/usePublishedShow.ts        # 公开路由（无令牌）
  hooks/useOpeningHold.ts          # 开场字幕至少停留的时间
  hooks/useDraftPreviewShow.ts     # 作者路由：带令牌取回展示图（≤2048 JPEG）作为本地图片地址与沙箱 ctx.photos
```

公开地图只在**进入 3D 后**展示，不在 IntroGate 上出现；无公开位置时显示空态，不影响看展与场景（v0.10.0）。

**AI 地点候选（v0.12.1）**：地图分区的位置编辑器增加「AI 识别地点」按钮，仅作者可见、仅在用户点击时触发一次 `suggestphotolocation`（不在打开面板时自动/批量识别）；候选列表显示名称、坐标或范围、AI 理由，未确认候选不画进公开地图、不进入发布快照。用户可逐条「采用为位置」——打开粒度选择（area/exact/hidden；候选无坐标时只能 hidden，仅名称），确认后调用 `confirmphotolocationcandidate` 并刷新位置；也可忽略候选。加载中/空候选/失败分别显示对应状态（失败可重试，文案不暴露上游细节）；AI 重跑替换候选列表，已确认位置保持不变。`getphotolocationcandidates` 只读取当前候选，不触发 AI；离开/重新打开面板时按需读取上次候选。

**共同投稿页面与分区**（v0.11.0；回忆优先 v0.11.1；建议图注 v0.11.2；照片必填 v0.12.0）：

- `/invite/:token` 邀请页：只显示展览标题、邀请人展示名（创建者资料的 displayName，未设置退回用户名）与邀请状态（active/closed）；文案“为这场展览写下一段回忆，并附一张照片”；未登录提示登录后加入，已加入直接进入“我参与的”；不显示封面、照片、讲述、位置或成员列表，关闭链接显示不可加入。
- `/contributions` 我参与的（v0.13.1 前称“我的回忆”）：以回忆 + 照片为主（提交时回忆必填、照片必填；保存草稿可暂缺照片），地点与建议图注可选（≤120 字，策展人可采用或修改；清空建议传空串）；支持保存草稿、提交、撤回；提交前无照片时禁用/提示补图；显示 `draft`（待完善）、`submitted`、已采用结果、待确认更新、`declined`（未被采用，可编辑后重新提交）、`withdrawn`、参与被撤销（禁用提交与更新，保留查看/撤回）；历史纯文字投稿标注“历史纯文字回忆”，可查看/撤回/拒绝或补图后重提；撤回会按 v1.11.1 清理该投稿的已采用讲述/由它新建的草稿照片（已发布快照不变）。
- 工作台「投稿」分区仅创建者可见：邀请管理、参与者与撤销、审阅列表与详情（按章节分组选择，卡片显示建议图注）、采用对话框、拒绝动作、已采用记忆的移除；采用只剩“收进草稿 + 图注（预填建议图注）+ 位置”，不再有“关联已有照片/选择已有照片”路径；无照片投稿不可采用（400 `CONTRIBUTION_PHOTO_REQUIRED`），可直接拒绝；移除已采用讲述会按 v1.11.1 清理**采用新建**且无其他讲述的草稿照片（被 active 快照引用则归档、公开不变），历史已有照片目标只删讲述、保留照片；撤回已采用投稿同样先清理再置 withdrawn；目标锁定/原地更新语义沿用 v1.9。
- 工作台策展照片卡片提供图注编辑入口（复用 `updatecuration`，不新增路由/字段）；图注修改进入策展草稿，按既有保存与发布流程生效，公开页在重新发布前不变。
- 公开页照片大图在原图注/AI 配文之后逐条展示“讲述 + 署名”；数据只来自 active 快照，投稿后续修改/撤回/拒绝不影响公开页；历史纯文字被采用到已有照片的旧数据继续显示，新模型不再产生该路径。公开页本身无变化。


**作者主页足迹地图**（v0.10.1）：作者主页既有资料与展览卡片之后增加只读地图，展示该作者全部已发布展览的公开位置标记（来自各 active 快照的 `locations`，只含 area/exact）；标记按位置聚类，点击聚类放大地图，标记弹窗显示缩略图、地点名、展览名与「查看展览」入口。v1 不做时间/展览过滤；无公开位置时整块不显示。地图仍是页面内的业务区域，不新增页面路径；沿用同一懒加载地图封装与瓦片配置。

### 11.3 状态建模

- 依赖 API 的状态用判别联合：`loading | ready | empty | error | submitting`。
- AI 地点候选独立建模：`loading | ready(candidates) | empty | error`，确认动作单独 `confirming`；不在打开面板/切换照片时自动请求 AI，不把候选混入已确认位置状态（v0.12.1）。
- 简单表单用局部 `useState`。
- Zustand 只存跨页面共享核心数据：`sessionStore(token, user)`；页面数据用 hooks 拉取。
- 纯函数禁用 `useXXX`；组件禁用 `getXXX`；store 只公开语义化 `use`/`set`/`get` 函数。

### 11.4 前端目录

```text
frontend/src/
  main.tsx, App.tsx, index.css
  pages/
    Auth/  Exhibitions/  Workspace/  PublicShow/
  components/ui/        # Button, Dialog, Spinner, ErrorState, EmptyState, PhotoThumb, TopBar
  apis/
    shared/             # apiName 推导、send、token 存储、错误类型
    users/ gallery/ curation/ scene/
  objects/              # 跨页面 DTO
  scene/
    sandbox.tsx         # iframe 生命周期、srcdoc 组装、消息协议
    runtime.ts          # SceneRuntime：渲染器/纹理/控制/截图/统计（沙箱内执行）
    contract.ts         # ctx 契约（与后端提示词共用的字符串常量）
    capture.ts          # 视图截图与运行时证据收集
  stores/sessionStore.ts
  lib/
```

### 11.5 样式与可用性

- 全部 Tailwind，不新增自定义 CSS；一维 Flexbox、二维 Grid。
- 中文界面；桌面优先；loading/错误/空状态齐全；破坏性操作二次确认。
- 场景生成期间展示阶段文案（生成题面 → 写代码 → 渲染 → 评审），避免长时间空白。

### 11.6 视觉设计系统（最小集）

产品定位是“私人记忆档案馆”，视觉气质：克制、编辑感、留白充分；拒绝 SaaS 仪表盘感、霓虹科技感、组件堆砌。视觉为照片与叙事让路，不抢 3D 场景的注意力。

**字体与排版（两族字体、一级字号阶梯）**

- 自托管字体：`@fontsource/noto-serif-sc`（展示）与 `@fontsource/noto-sans-sc`（正文），按 `unicode-range` 分片加载，只 import 实际用到的字重；不依赖 Google Fonts 运行时，演示环境不需要外网。
- 展示字体（展览标题、场景入口导语）：`Noto Serif SC` 500/600，回退 `Source Han Serif SC, Songti SC, SimSun, serif`。
- 正文字体（UI、表单、正文）：`Noto Sans SC` 400/500，回退 `PingFang SC, Microsoft YaHei, system-ui, -apple-system, "Segoe UI", sans-serif`。
- 首屏只预加载标题 600 的常用分片，其余由浏览器按需加载；不一次加载全部字重。
- 字号阶梯固定 6 档，不新增：display 44/52、h1 30/40、h2 20/30、body 15/26、caption 13/20、micro 11/16（字号/行高，px）；标题字距 -1%，正文 0。
- 禁止：第三种字体族、装饰字体、正文全大写、随手写 `text-[17px]` 之类任意值；行高不低于 1.4。

**颜色与材质（8 个 token + 深色点缀 `night`；下表为默认值，展览相关页面随场景变化）**

| token | 值 | 用途 |
|---|---|---|
| `bg` | `#F6F2EA` | 页面底色（暖纸） |
| `surface` | `#FFFDF9` | 卡片/表单 |
| `ink` | `#1D1B18` | 主文字 |
| `muted` | `#6F685E` | 次要文字 |
| `line` | `#E4DDD1` | 分割线/描边 |
| `accent` | `#8C5A3B` | 主强调（陶土色），只用于关键动作与当前状态 |
| `accentSoft` | `#F0E4D8` | 强调底色 |
| `danger` | `#B3261E` | 错误/删除 |
| `night` | `#3A2E26` | 胡桃木棕深色点缀：视觉重心与舞台（见下），以及公开页、场景沉浸层底色；不做大面积表单底色 |

- 浅色做底、深色点缀（v0.9.4）：深色只放在每一屏的视觉重心上——全站顶栏、工作台"下一步"卡片、当前分区标签、照片墙与三维场景舞台、有未保存修改时的策展保存栏、公开页与沉浸观看覆盖层。一屏内深色面积约一到两成，每屏至少一处；深色块只承担"焦点"或"舞台"一个角色，不承载大段正文。
- 第三层中间色：「AI 灵感」面板用 `accentSoft` 底，与策展的纸色主体区分。
- 深色底上：文字用 `surface`（次要文字用 `surface` 的 60–70% 不透明度），主按钮用 `accentSoft` 底 + `night` 字（Button `inversePrimary`；陶土 `accent` 在深棕上对比不足），次要按钮用半透明 `surface`（Button `inverse`）。不另起第二套色板。
- 跟随场景配色（v0.9.8）：除 `danger` 外的 8 个 token 取自 CSS 变量，默认值即上表（胡桃木配色）。工作台及其子页、看展预览与公开页按该展览的场景题面主色推导整套 token（`src/theme`，纯函数）：`night` 取最深的主色并压到深色舞台的亮度区间，中性色沿用默认配色的明暗、只换成该色相，`accent` 取场景基调（`night`）的色相与最鲜艳主色的彩度、降亮度到浅底可读，使按钮、链接、徽标与整个界面同色系（基调近乎无彩时才借用最鲜艳主色的色相），`accentSoft` 是它的浅色版本。推导结果逐组校验对比度（正文 4.5:1、主文字 7:1、深色舞台上的浅色字 10:1），任一不达标或没有可用主色时整体退回默认配色。展览列表与作者主页同时出现多个展览，页面保持默认配色，每张卡片局部套用自己的配色并显示场景主色条。这仍是同一套 token 的不同取值，不新增第二强调色或第二套色板。
- 禁止：第二强调色、装饰性渐变（场景天空除外）、玻璃拟态、重阴影（最多 `shadow-sm` 一档）、彩色 emoji 图标。
- 圆角只两档：`rounded-md`（8px，控件）与 `rounded-xl`（16px，卡片），不混用第三种。

**布局、组件与动效**

- 8px 间距网格；内容最大宽度 1200px；页面左右留白 ≥32px；卡片内边距 24px。
- 组件最小集：Button（primary/secondary/ghost/danger，深色底用 inverse/inversePrimary）、Input、Dialog、Toast、EmptyState、ErrorState、Spinner、PhotoCard、TopBar；不引入 UI 组件库，不新增重复组件。
- 状态必须齐全：loading（骨架或 spinner）、空态、错误态、禁用态、键盘可见的 focus ring（2px accent）。
- 动效分两档（v0.9.8）：微交互（悬停、按下、收放）150–250ms `ease-out`，只做淡入与 ≤8px 位移；场景切换 300–600ms，由渐隐、位移（≤24px）与共享元素补间组成——页面切换时顶栏保持不动、其余整页快速交叉渐变（旧画面 150ms 渐隐、新画面 250ms 渐显），随后各页的内容区块在数据就绪后依次渐显并上浮 12px（`Reveal`，间隔 40ms、最多等 320ms；异步加载的内容在切换瞬间还不存在，只靠整页交叉看不出变化），工作台切换分区时当前项底板滑到新位置、新分区内容再上浮进场，进入/退出场景用带类型的整页 View Transition（整页缩放加交叉渐变，不用封面/标题的共享元素：场景舞台是 iframe 画面，补间时会拉伸变形，文字缩放也会出重影），打开/关闭大图用 View Transitions 让缩略图与大图在两个状态之间补间，大图翻页从翻页方向滑入，卡片列表与记忆档案照片逐项上浮进场（同一间隔）；按钮按下下沉 1px，作者主页展览卡片悬停上抬 4px。含 `position: fixed` 子元素的区域（AI 灵感悬浮面板、三维场景分区）不带位移，只渐显。沉浸观看开场字幕的渐隐 500ms，侧栏与底部面板的收放可位移其自身高度/宽度。跨页面跳转不做共享元素补间（目标页先进入加载态，切换瞬间没有可补间的元素）。禁止弹跳/旋转/过度视差；尊重 `prefers-reduced-motion`（CSS 关闭全部动画，JS 侧直接跳过 View Transition）。View Transition 的伪元素不属于任何元素、Tailwind 写不到，相关规则集中在 `index.css` 并注明原因。
- 公开场景页与工作台沉浸观看：全屏 canvas，覆盖层只保留标题、入口导语、章节/照片侧栏（或返回、重新生成、发布）与进入/退出；用暗色渐变保证文字可读，不加额外装饰。

**类型定义同样保持最小**

- 跨页面 DTO 只在 `src/objects/` 定义一次；页面级 view model 在页面 `objects/` 中由 DTO 组合，不重复声明同构 interface。
- 判别联合只用于真实多态（请求状态、场景运行状态），不为“看起来类型化”而拆分。
- 不引入 `any` 与隐式 `any`；不用 `as` 强转绕过类型收窄。

**视觉走查（D6 验收项）**

- 检查：两族字体、8 个颜色 token 以内、两档圆角、无自定义 CSS 文件、无重复组件、无 emoji 图标；1440×900 首屏与 390×844 移动端各看一次。
- 目标：像“私人记忆档案馆”，不像后台管理系统；允许少量留白与不对称排版，但不牺牲可点击性与可读性。

## 12. 后端工程结构

```text
backend/build.sbt, backend/project/build.properties, backend/project/plugins.sbt
docker-compose.yml          # 可选：PostgreSQL 16，宿主端口 5433
backend/src/main/scala/
  services/
    system/
      api/        # APIMessage 基类与类别标记
      routes/     # 路由器、注册表、令牌解析、错误响应
      db/         # HikariCP、事务、类型化查询/行映射
      config/     # AppConfig（环境变量）
      ai/         # Vision/Text/Review 端口、OpenAI 兼容实现、Fake、重试与限流
      assets/     # 前端静态资源、/vendor/three.min.js、SPA fallback
      startup/    # 启动、路由合并、初始器列表
    users/  {api, objects, routes, tables, utils}
    gallery/{api, objects, routes, tables, utils}
    curation/{api, objects, routes, tables, utils}
    scene/  {api, objects, routes, tables, utils}
backend/src/main/resources/application.conf, logback.xml
frontend/...
data/            # 上传文件，gitignore
```

- 一 API 一文件；一对象一文件；一表一文件夹（`XXTable.scala` + `XXTableInitializer.scala`）。
- `objects/apiTypes/` 每 API 一个响应结构；共享子结构抽成独立对象文件。
- SQL `val` 私有、紧贴对应 `def` 之前；公开表函数返回 `IO[T]`。
- 表归属：users / gallery / curation / scene 各归其服务；system 无业务表。
- 服务间只通过公开 API 消息或公开 Table 方法访问；`utils` 一律 `private[服务名]`。
- 提示词放在 `scene/utils/prompts/`（`private[scene]`），版本号写入 `scene_runs.prompt_version`。
- `system/` 的额外子目录按 rules 3/4 说明理由：`db`（连接池、事务与类型化查询）、`config`（环境变量集中读取）、`ai`（模型端口与适配器，不归属任何业务服务）、`assets`（静态资源与 three 分发）、`startup`（启动编排与初始化器列表）、`migrations`（一次性数据迁移的独立 JVM 入口，不挂常规启动流程）；它们都是跨服务基础设施。

## 13. 安全与权限矩阵

| 资源/操作 | 未登录 | 非作者（已登录） | 作者 | 已发布展览的只读访问 |
|---|---|---|---|---|
| 注册/登录 | ✔ | ✔ | ✔ | ✔ |
| 我的展览列表 | ✘ | ✘ | ✔ | ✘ |
| 展览详情（含草稿） | ✘ | ✘ | ✔ | 公开视图仅标题/叙事/章节/照片/场景/公开位置 |
| 上传/删除照片、改策展 | ✘ | ✘ | ✔ | ✘ |
| 位置读写/公开粒度 | ✘ | ✘ | ✔ | — |
| 地点搜索（后端代理） | ✘ | ✔（登录即可，全应用限流；界面只在作者工作台） | ✔ | — |
| 公开地图位置 | 仅 active 快照的已确认公开位置 | 同左 | ✔ | ✔ |
| 主题建议/对话修订 | ✘ | ✘ | ✔ | ✘ |
| 生成场景/查看运行/回传评审 | ✘ | ✘ | ✔ | ✘ |
| 照片原始/缩略图 | 仅 active 快照 | 仅 active 快照（含已归档照片） | ✔ | ✔ |
| 封面图（照片/场景渲染） | 仅 active 快照 | 仅 active 快照 | ✔ | ✔ |
| 设置封面/上传渲染封面 | ✘ | ✘ | ✔ | — |
| 场景代码 | 仅 active 快照 | 仅 active 快照 | ✔ | ✔ |
| 发布/更新发布 | ✘ | ✘ | ✔ | — |
| 下线（P1） | ✘ | ✘ | ✔ | — |
| 场景版本历史/恢复旧版本 | ✘ | ✘ | ✔ | ✘ |
| 照片记忆档案（AI 解读） | ✘ | ✘ | ✔ | ✘ |
| 账户资料/修改密码 | ✘ | 仅本人 | 仅本人 | — |
| 作者主页 | 仅作者开启后 | 仅作者开启后 | ✔ | 只列 active 快照 |
| 邀请链接预览（凭 token） | 仅标题/状态 | 同左 | ✔ | — |
| 邀请兑换/参与关系 | ✘ | ✔（有效 token；创建者不可加入自己的展览） | — | — |
| 投稿上传/编辑/撤回 | ✘ | 仅已授权投稿者本人（active；被撤销后只能查看/撤回） | ✘（创建者不可投稿自己的展览） | ✘ |
| 投稿私有图片 | ✘ | 仅投稿者本人 | ✔（本展览） | ✘ |
| 邀请管理/参与者撤销/审阅/采用/拒绝/移除记忆 | ✘ | ✘ | ✔ | ✘ |
| 纯文字回忆（0 照片） | ✘ | 已授权投稿者本人（不受照片配额限制） | ✘ | ✘ |
| 公开讲述与署名 | 仅 active 快照 | 同左 | ✔ | ✔ |

- 密码 BCrypt；令牌 32 字节随机、DB 只存 SHA-256 哈希、30 天过期。
- 越权访问统一 404。
- 位置默认仅草稿可见；`hidden` 与未确认建议不出现在公开视图；公开页只读 active 快照的已确认公开位置（v0.10.0）。
- 地点搜索只提交用户明确输入的地点名称，不携带坐标、照片、回忆或邀请令牌；提供方不可用与服务失败返回独立错误码（`UPSTREAM_UNAVAILABLE`），不冒充模型失败。
- 修改密码必须提供当前密码；成功后吊销该用户全部会话并签发新令牌。当前密码错误返回 400 `PASSWORD_INCORRECT`（不用 401，避免前端误判会话失效）。
- 作者主页默认关闭；未开启与用户不存在返回同一个 404，防止枚举用户名；公开页只有作者开启主页时才附带作者入口。
- 共同投稿（v0.11.0）：邀请令牌只作加入凭证，不能读私有图片或草稿；被撤销参与是终态 v1（不能重新加入），仍可查看/撤回自己的投稿；创建者加入或投稿自己的展览统一 400 `CONTRIBUTION_SELF_NOT_ALLOWED`；邀请预览只返回标题、邀请人展示名与状态，不泄露私有内容。
- 采用后的讲述与署名冻结进公开快照，来源投稿 id/账号不公开；投稿后续修改/撤回不影响已发布内容，需再次采用并重新发布。
- 上传校验 mime/文件头/尺寸/扩展名；存储 key 由服务端生成。
- 生成代码只在沙箱运行；后端不执行、不解析、不 eval 任何模型生成代码。
- 日志不记录令牌、密码、API key；模型请求只记录耗时、模型名与结果状态。
- `AI_API_KEY` 只存放在 `.env`（gitignored，Windows ACL 已收紧为仅当前用户可读写）与进程环境变量中；后端不下发前端、不入库；密钥若出现在对话、日志、截图等外部记录中应轮换。
- 隐私说明写在 `README.md`，不在界面常驻展示：照片与场景截图会发送给 OpenCode Go / DeepSeek 用于分析、题面生成与评审；原图保存在本机 `data/`。

## 14. 测试与验收

### 14.1 最小测试集（1 周内必须存在）

| 测试 | 覆盖 |
|---|---|
| `ScenePromptSpec` | 题面必填小节、照片清单齐全、负面约束 ≤5、字数上限 |
| `SceneRuntimeMessageCodecSpec` | 父页面 ↔ iframe 消息结构（init/capture/error）编解码与拒绝非法消息 |
| `ReviewDecisionSpec` | 硬门禁各条；加权分阈值；issues 上限；通过/修订/兜底分支 |
| `CodeSanitizerSpec` | 去 markdown 围栏、大小上限、空代码、HTML 片段混入拒绝 |
| `CurationValidatorSpec` | 主题提案覆盖完整/重复/未知照片；修订提案非法 photoId |
| `AuthVisibilitySpec` | 注册/登录/令牌解析；草稿仅作者；active 快照公开可读；未登录 401（需 PostgreSQL 测试库） |
| `PublicationSpec` | 首次发布生成 active 快照；编辑草稿不改变公开读；再次发布 version+1 且旧版 superseded；部分唯一索引保证单 active |
| `SceneStaleSpec` | 增删照片/改策展后 sceneStale=true；发布被拒（SCENE_STALE）；重新生成后可发布 |
| `RouteNameSpec` | 消息名 → 路由名推导 |
| `ScenePipelineSpec`（Fake AI + Fake 客户端证据） | 一次通过；评审不通过→修订→通过；次数用尽→兜底 |
| `SceneCancelSpec` | 取消非终态运行→`Cancelled` 且不再发起后续评审/修复；终态运行取消→`CONFLICT`；取消后可重新生成 |
| `CoverSpec` | `setcover` 三态校验；render 封面必须来自本展览；封面随发布快照冻结；公开读 active 快照封面 |
| `ContractFixtureSpec`（后端） | `docs/contracts/` 全部 response 解码 → 编码 → 与样例对象等价；全部 request 解码成功；可选字段 `null` 形态 |
| `contract.test.ts`（前端） | 同一批样例经前端解码层不抛错；关键页面用 fixture 渲染 smoke |

沙箱本身（iframe 渲染、截图）用 1 个手工 E2E 检查清单验证，不做自动化 UI 测试。

### 14.2 演示脚本（10 步，D7 验收）

1. 注册账号并登录。
2. 新建展览，上传 8 张照片（海边/城市/室内混合），缩略图正常，删除 1 张再补传。
3. 生成主题，10–20 秒内返回 2–3 个方案。
4. 应用一个方案，改标题、调整顺序、改 2 条图注，刷新后保持。
5. 输入修订指令，返回提案并应用。
6. 查看 AI 的情绪解读与题面摘要，生成场景：显示“写代码 → 渲染 → 评审”阶段；评审给出五项评分与通过结论。
7. 沙箱预览可旋转/缩放；场景为纯环境、无照片实体；照片在侧栏/大图与图注中可查看。
8. 故意展示一次修订或兜底（可切换 `AI_MODE=fake` 或注入坏代码）：系统能带问题重生成或回退兜底。
9. 发布，复制链接；无痕窗口打开公开链接可见只读场景；继续编辑草稿后公开页不变，点“更新发布”后公开展示新版本；从未发布的展览链接 404。
10. 断网/切 fake 模式重新生成成功，证明演示不赌模型。

### 14.3 已知演示兜底

- `AI_MODE=fake` 可完整跑通全流程。
- 兜底工件保证场景在模型故障时仍可渲染。
- 数据库可用本机 PostgreSQL 或 compose 容器，现场不依赖外部云服务（除模型 API）。

## 15. 里程碑（7 个日历日）

| 天 | 目标 | 交付物 | 当日验收 | 顺延时砍什么 |
|---|---|---|---|---|
| D1 | 骨架与契约 | 安装 sbt；sbt 工程；docker-compose（可选）；system（连接池/配置/路由/错误/事务/静态）；users 服务；前端脚手架；登录注册页；API 客户端基础设施；`docs/contracts/` 骨架 + users 样例 + `ContractFixtureSpec` | `sbt run` 起服务；注册→登录→受保护接口 401/200；前端能登录并保持会话；users 契约测试通过 | 不砍 |
| D2 | 相册与展览 | gallery 表与初始化、创建/列表/详情/改名/删除、multipart 上传、缩略图、照片内容路由、封面（自动/指定照片）、权限；gallery 路由样例 | 上传 8 张、缩略图显示、删除、刷新仍在；换封面后列表生效；他人草稿 404；gallery 契约测试通过 | 不砍 |
| D3 | AI 策展主链路 | VLM 情绪与记忆分析 + 缓存、主题建议、应用生成章节、策展编辑器、修订 API；curation 路由样例 | 8 张→2–3 主题→应用→手动编辑→刷新一致；修订指令能说出改动；curation 契约测试通过 | 编辑器只支持章节内上下移动 |
| D4 | 场景生成服务 + 沙箱 | scene 表；父题面提示词；子代码生成提示词；代码清洗；异步状态机；兜底工件；`/vendor/three.min.js`；SceneRuntime（渲染/纹理/控制/截图/统计）；SceneSandbox 组件 | 手写一个 `build(ctx)` 能在沙箱渲染并截图；模型生成的代码可保存/回传；错误可捕获 | 先只支持初始视角截图（1 张） |
| D5 | 主观验收闭环 | 评审提示词与 `ReviewSceneMessage`、硬门禁、阈值、修订循环、`cancelscene`、ScenePanel（生成/阶段/耗时/停止/评分/预览/重新生成）；前端轮询闭环；scene 路由样例（含 runtime/captures 对象） | 端到端：生成→渲染→评审→（修订或通过）；点“停止”后不再发起新的评审/修复调用；评分与 issues 可展示；scene 契约测试通过 | 关闭自动修订，只评审一次；用户手动重新生成 |
| D6 | 发布快照与公开页 + 打磨 | `publications` 表与事务性发布/更新、公开 API（读 active 快照）、先导页 → 3D、场景渲染封面上传与冻结、空/错状态、测试、演示数据；22 条路由样例覆盖检查 | 首次发布公开可见；编辑草稿不改变公开内容；再次发布版本切换；先导页可进入 3D；场景截图可设为封面；无 active 快照 404；`ContractFixtureSpec` + 前端 contract test 全绿；演示脚本 1–9 步跑通 | 先砍渲染封面，只保留自动/照片封面；公开页章节侧栏再砍 |
| D7 | 缓冲与演示 | 修 bug、录演示、课程报告素材、最终验收 | 完整脚本跑通两次（live 与 fake） | 只修不写新功能 |

## 16. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 生成代码质量不稳定（语法错、黑屏、不用照片） | 场景不可用 | 契约写死 + 成功示例 + 运行时错误回灌 + 评审 issues 修订 + 兜底工件；D4 先统计一次成功率 |
| 沙箱截图被跨源污染（toDataURL 失败） | 无法评审 | 照片用 ArrayBuffer 经 postMessage 传入、iframe 内建 Blob URL；D4 第一件事验证；不行则回退 data URL 纹理 |
| VLM 评审方差大 | 误判通过/反复修订 | 固定 rubric + 硬门禁 + 阈值可配 + 3 组固定回归样本校准；评审意见必须引用截图证据 |
| 模型 JSON/代码输出不稳定 | 生成失败 | 去围栏、校验、重试、兜底；错误结构化回灌 |
| 模型延迟/额度 | 演示卡顿 | 分析缓存、并发限流、超时、演示预热、fake 模式 |
| 1 周范围溢出 | 演示不完整 | 每日验收 + 顺延砍单表；P1 全砍，P0 不可砍 |
| PostgreSQL 环境未就绪 | D1 阻塞 | 本机 18 已在运行；Docker compose 备选（端口 5433）；`DB_URL` 可换任意实例 |
| sbt 未安装 | D1 阻塞 | 第一件事用 winget/coursier 安装并验证 `sbt sbtVersion` |
| 生成代码的伦理/安全风险 | 沙箱逃逸、网络外联 | iframe 沙箱 + CSP 无网络 + 无同源；代码不进后端；大小/时长限制 |
| 发布快照增加实现量（表、事务、公开读路径） | 挤压 D6 | 只保留一个 active 版本、无版本历史 UI；下线与章节侧栏先砍 |
| 单人测试无配额，可能烧掉 Go 额度 | 演示前额度耗尽 | 演示前预热分析缓存；直连失败时切 `AI_MODE=fake`；每场景最多 3 次代码生成 |
| 生成时间过长或取消不彻底 | 用户等待、浪费 token | 单次调用看门狗 30 分钟；`cancelscene` 优先阻止后续评审/修复调用；取消后状态可恢复，可重新生成 |
| 封面（尤其场景截图）增加上传/存储/公开读路径 | 挤压 D6 | 渲染封面可先隐藏，只保留自动/照片封面；文件存储与照片路由复用 |

## 17. 决策记录

| 编号 | 决策 | 理由 |
|---|---|---|
| DR-1 | 不使用课程脚手架，按 rules.md 自建 | 课程未提供模板；结构本身是交付物的一部分 |
| DR-2 | 三维场景产物是**可运行代码**（`build(ctx)` 函数），自由生成；宿主提供沙箱运行时 | 用户明确要求自由，不做原型库约束；可运行代码是唯一能表达任意空间与光效的产物 |
| DR-3 | PostgreSQL 16+（本机 18 可用），每服务一个 schema，HikariCP + 类型化 JDBC；不引入 ORM/doobie；**不强制 Docker** | `plan(connection)` 的连接模型与 ORM/Transactor 生命周期冲突；Docker 只是启动方式之一 |
| DR-4 | 发布快照单源 `gallery.publications`；场景产物单源 `scene`；公开场景 API 通过 active 快照的 `sceneRunId` 取代码 | 避免状态漂移；公开读取只信 active 快照 |
| DR-5 | 允许两条非消息路由：multipart 上传、图片二进制下载 | JSON 消息模型不适合传图片字节 |
| DR-6 | 场景生成异步（排队 + 客户端渲染 + 回传），不做 SSE/WebSocket | 生成与评审都耗时；轮询最简单 |
| DR-7 | AI 端口 + OpenAI 兼容适配器 + Fake 实现 | 可测试、可离线演示、可换 provider |
| DR-8 | 预览图 = 浏览器实时渲染；服务端无头截图 P2 | 1 周内 Chromium 依赖成本高于收益 |
| DR-9 | 策展内容关系化存储（章节表 + 照片表） | 外键保证照片引用完整；整替在事务内 |
| DR-10 | 令牌存 SHA-256 哈希，密码 BCrypt | 泄露 DB 不等于泄露会话 |
| DR-11 | 对话修订为“指令 + 结构化提案”，不做自由多轮 agent 对话 | 能力保留，实现可控；多轮会话 P1 |
| DR-12 | 前端用 react-three-fiber？**否**：沙箱内直接用 three.js UMD + 手写 SceneRuntime | 生成代码在 iframe 内独立运行，R3F 无法跨 iframe 复用；SceneRuntime 直接操作 three.js |
| DR-13 | 场景是情绪意境，不是照片复刻；**2026-10-28 起场景为纯环境，三维中不出现照片实体**（照片在侧栏/大图/图注查看） | 用户 2026-10-27 定性 + 2026-10-28 看真实渲染后改为纯场景 |
| DR-14 | 放弃原型库/参数化 DSL，改为题面驱动的自由生成 | 用户明确表示原型限制太死；配合题库式题面规范 |
| DR-15 | 主观验收 = VLM 按 rubric 看截图打分；确定性硬门禁兜底 | 用户明确验收可以主观；纯主观不可复现，硬门禁保证不交付坏产物 |
| DR-16 | 生成代码执行在 `sandbox="allow-scripts"` 的 iframe 内，CSP 禁网、禁同源 | 不可信代码隔离；应用侧保持类型安全，只用类型化消息交换 |
| DR-17 | 截图与运行时证据来自客户端，仅用于评审，不作为授权/安全判据 | 客户端证据不可作为安全边界；沙箱承担执行风险 |
| DR-18 | PostgreSQL 部署不绑定 Docker：本机实例或 compose 均可 | 用户询问后确认；本机已有 18 服务，compose 端口用 5433 避免冲突 |
| DR-19 | 题面与评审规范参考 ArenaGalleri 建模题库（18 题）提炼 | 用户提供的参考；题库题面被证明能驱动出可运行 3D 作品 |
| DR-20 | 不引入 Agent Harness 框架（Pi / DeepSeek Harness / Claude Code 等）；编排为项目内类型化状态机，沙箱运行时自建 | 这些框架是带文件/命令工具的交互式编码客户端，不是可嵌入 Scala 服务的库；引入会带来进程管理、权限面与版本漂移，且不解决本项目最难的题面质量与沙箱验收；1 周内自建更小更可控 |
| DR-21 | AI 接入使用 OpenCode Go；客户端带自定义 UA 与稳定 `x-opencode-session` | 用户已有 Go 订阅；Go 文档要求可识别客户端与会话头；网关与模型可替换 |
| DR-22 | 模型统一 `deepseek-v4.1-flash`（OpenAI Chat Completions），MVP 只实现单协议适配器 | 用户指定；视觉与编码能力已确认（2026-10-27）；价格低、Go 月度限额约 $80；单模型单协议显著简化适配层；评审保留单独覆盖项以规避同模型自评偏差 |
| DR-23 | 发布模型 = 工作草稿 + 不可变发布快照；编辑不影响公开版本，更新发布原子切换；下线 P1 | 用户要求编辑不破坏已发布内容；快照隔离避免公开页与草稿互相污染；只保留一个 active 版本控制复杂度 |
| DR-24 | 场景过期判定服务端化：run 记录 `photoIds` + `curationVersion`，`sceneStale` 由服务端计算，发布强制不 stale | 前端比对不可信；服务端才能阻止错误发布；比整段策展 hash 更简单 |
| DR-25 | 单人测试阶段不设产品级超时与每日配额；单次模型调用看门狗 30 分钟、整次运行不设时限 | 用户 2026-10-27 决定；配额无意义；30 分钟覆盖大代码生成，仍防 fiber 永久挂起 |
| DR-26 | 图片进沙箱前客户端降采样（≤2048 / JPEG 0.82），原图仅大图；缩略图按 EXIF 纠正；不支持 HEIC | 30×15MB 原图对 iframe 传输与纹理内存不可行；手机照片方向必须处理 |
| DR-27 | 字体自托管 Noto 分片（@fontsource unicode-range），不用 Google Fonts | 用户选择 Noto；自托管避免外网依赖与第三方运行时，分片控制体积 |
| DR-28 | `cancelscene` + 工作台“停止生成”：取消终止 fiber、阻止后续评审/修复调用 | 大型场景耗时不可控，需要主动止损；取消能省掉后续最贵的评审与修复调用；已发出的 HTTP 请求只能尽力中断 |
| DR-29 | 封面支持自动/照片/场景渲染截图；渲染封面与发布快照一起冻结 | 用户要求；渲染截图让封面与场景气质一致；存文件 + 固定可见性，不塞 base64 进列表 |
| DR-30 | 公开页“先导页 → 进入 3D”；分享链接用展览 UUID | 落地信息清楚、3D 加载不阻塞首屏；UUID 零额外成本 |
| DR-31 | 场景生成支持 ≤80 字用户氛围提示（仅作题面参考，不改策展） | 低成本提升可控性；不进入发布校验，不影响数据模型 |
| DR-32 | 契约以 `docs/contracts/` 共享 JSON 样例为可执行基准：后端解码 → 再编码与样例等价，前端用同一批样例测解码层 | 文档不可执行、两侧手写类型会漂移；样例让字段改名/可空性/枚举变化在测试期暴露；成本约 100–200 行测试 |
| DR-33 | HikariCP 连接池 `autoCommit=true`；多步写强制 `transaction(connection)(IO)` | 若池默认 `autoCommit=false`，忘记包事务的写路径会静默回滚，1 周 MVP 下故障难定位；`autoCommit=true` + 显式事务既保留多步原子性，又让单语句写入不依赖额外包装 |

## 18. 待确认 / 开放项

1. `AI_API_KEY` 已存入 `.env`；真实冒烟尚未执行（仍处于 spec 阶段）：文本、图片（`image_url` + data URL）、JSON 输出、`build(ctx)` 代码生成。视觉能力已由用户确认，冒烟只验证网关格式与 JSON 模式兼容性。
2. Go 订阅额度：`deepseek-v4.1-flash` 月度限额约 $80（Go 价 off-peak $0.15/$0.60、peak $0.30/$1.20，每 1M tokens），按每场景 1 次题面 + ≤3 次代码 + ≤3 次评审估算；限额耗尽时降级到 `AI_MODE=fake` 或兜底工件。
3. 题面长度与评审阈值（默认 400–2000 字（v0.9.9 起）、3.0 分（v0.9.9 起））是否合适；D5 用 3 组回归样本校准。
4. 生成的场景代码是否允许程序化纹理/噪声等计算（默认允许，会消耗性能）。
5. 课程演示时长与报告格式要求（影响 D7 产出物）。
6. 契约样例与契约测试方案已定（8.7、DR-32）；D1 建骨架，D2/D3/D5 逐服务补样例，D6 前 22 条路由全覆盖。

## 19. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-10-27 | 初稿：产品范围、架构、数据模型、API 契约、三维 DSL（照片挂墙模型）、里程碑 |
| v0.2 | 2026-10-27 | 数据库改 PostgreSQL；三维改为情绪意境场景（原型库 + 参数化 DSL）；`showroom` 更名 `scene` |
| v0.3 | 2026-10-27 | 三维改为自由生成代码 + 沙箱 + VLM 主观验收；新增 reviewscene；PostgreSQL 部署不绑定 Docker；题面规范独立成 `docs/scene-prompt-spec.md` |
| v0.4 | 2026-10-27 | 确定 OpenCode Go 接入（双协议适配、UA 与会话头要求）；明确不使用 Agent Harness 框架，术语澄清 Harness=SceneRuntime；开发库已建（PG 18.6 / momentarium） |
| v0.4.1 | 2026-10-27 | AI 统一 `deepseek-v4.1-flash`（OpenAI Chat Completions 单协议，视觉能力已由用户确认）；MVP 精简为单协议适配器；修正环境变量表；新增 DR-22；冒烟目标改为验证网关多模态格式与 JSON 模式 |
| v0.4.2 | 2026-10-27 | 新增 11.6 视觉设计系统（字体/色板/圆角/组件/动效最小集，类型定义最小化）；13 节补充 AI 密钥管理；`.env` 已写入 OpenCode Go key 并收紧 ACL |
| v0.5 | 2026-10-27 | 发布模型改为工作草稿 + 发布快照（publications）；场景过期服务端化（photoIds / curationVersion / sceneStale）；图片管线降采样、EXIF、HEIC 约束；字体自托管 Noto 分片；单人测试阶段不设超时与配额，仅保留看门狗；新增 8.6 reason 码、并发约束与 DR-23~27 |
| v0.6 | 2026-10-27 | 看门狗放宽到 30 分钟且仅限单次调用；取消整次运行时限；新增 `cancelscene` 与“停止生成”按钮，运行状态增加 `Cancelled`；移除前端断开自动判负；新增 DR-28 |
| v0.7 | 2026-10-27 | 封面三态（自动/照片/场景渲染截图，随发布快照冻结）；场景生成支持 ≤80 字氛围提示；公开页“先导页 → 进入 3D”；新增 `setcover` 与两条封面二进制路由（22 条路由）；新增 `docs/api-contract.md`；新增 DR-29~31 |
| v0.8 | 2026-10-27 | 新增 8.7 契约样例与契约测试（`docs/contracts/` 共享 JSON；后端 decode/encode 等价、前端同批样例测解码层）；里程碑各日补样例任务；新增 DR-32；隐私说明位置定为 README |
| v0.9 | 2026-10-27 | rubric 统一为五维；`SceneBrief` 补 `userHint`；通过判定与 spec/题面规范对齐；reason 码分层（`USERNAME_TAKEN`/`VERSION_CONFLICT` 归 409）；配置名与 `.env.example` 校正；§12 补 `system/` 子目录理由；路由总数表述补全；api-contract 对齐本版 |
| v0.9.1 | 2026-10-27 | HikariCP `autoCommit` 改为 true，多步写强制 `transaction(connection)(IO)`；新增 DR-33；AI 适配器 usage 日志字段按网关实测形状（`usage.cost` 与 `usage.opencode`，无 allowance）；公开页深色覆盖层定为 `night` token（第 9 色，仅公开页）；`SceneBrief.palette` 统一为 `List[String]`（#RRGGBB，与 api-contract 一致） |
| v0.9.2 | 2026-10-28 | **纯场景决策**（用户看 live 真实渲染后提出"照片直接放里面突兀，改纯场景"）：3D 场景中不出现照片实体（照片平面/相框/照片墙/贴图方块/漂浮卡片禁止）；照片改由照片区、策展区、公开页侧栏与大图/图注查看。硬门禁删除"photoIdsUsed 覆盖 run.photoIds"，其余 6 条保留；子提示词删除"必须使用全部 ctx.photos"并禁止照片实体；兜底工件/ Fake 模板改纯程序化场景；rubric 五维字段不变，`photoPresence` 语义改为"照片情绪在场感（不要求实体出现，出现实体反而扣分）"；DR-13 更新；api-contract/契约 JSON 形状不变 |
| v0.9.3 | 2026-10-29 | **前端体验迭代**：工作台按进度落到"下一步"所在分区并在页头提示、分区写入网址 `?tab=`、未保存策展离开确认；策展章节目录/收起/章节排序/底部吸附保存栏，上传或删除照片不再静默重置未保存草稿；场景前端取消 180s 超时判负（改为 3 分钟后放慢轮询并提示可停止），`SceneRunView` 增加 `createdAt`（api-contract §4.1 与 scene 契约样例同步）用于显示已用时间与总用时 |
| v0.9.4 | 2026-10-29 | **工作台视觉与结构**：分区由 5 个减为 4 个（「AI 灵感」收进策展，悬浮在策展上可展开 / 收起，应用即填入草稿并在策展顶部提示）；新增看展预览 `/exhibitions/:id/view`（复用公开页先导页与 3D，未发布也能看，列表与工作台都有「看展」入口，§11.1/§11.2）；配色改为"浅色做底、深色点缀"，`night` 由 `#15140F` 改为胡桃木棕 `#3A2E26` 并允许用于工作台视觉重心（§11.6），深色底主按钮用 `accentSoft`；三维场景分区以深色舞台为主体，新增沉浸观看（同一元素切换全屏、`?view=immersive`、仅评审通过后可进入，§11.2）。不改接口与产品范围 |
| v0.9.5 | 2026-10-29 | **看展界面氛围**：进入场景先出开场字幕（标题 + 入口导语，至少停留 3 秒后渐隐）；章节侧栏改为展览叙事 + 两列照片网格并带滑入滑出动画（修掉 `w-80` 不在间距刻度里导致侧栏被文字撑宽的问题）；大图变成按叙事顺序翻看的导览。动效规则新增 500ms 一档。不改接口与产品范围 |
| v0.9.7 | 2026-10-31 | **新增四个页面（需求驱动）**：场景版本历史（SC-04 局部退化时可回到更满意的旧版本；恢复=克隆为新的 succeeded 运行，发布逻辑不变）、照片记忆档案（展示已缓存的逐张 AI 解读）、账户设置（资料、主页开关、改密）、作者主页（P1「公开列表页」，作者主动开启才公开）。接口 22 → 30 条，新增 `users.profiles` 与 `scene_runs.restored_from`，新增 5 个 reason 码；`PublicExhibitionView` 增加可空 `author`（v0.9.6 的确定性修复见文首变更说明） |
| v0.9.8 | 2026-10-31 | **视觉体验（用户审查后提出）**：照片 AI 解读（主色、配文、感官描写）随发布冻结进快照，在看展侧栏与大图中展示；展览相关页面按场景题面主色推导整套配色并校验对比度，推导不出时退回默认胡桃木配色；新增页面切换、进入/退出场景、大图开合与翻页、列表逐项进场等动效，动效规则改为两档。契约 v1.5：`ExhibitionSummary`/`ExhibitionDetail`/`PublicExhibitionView`/`AuthorExhibitionCard` 增加 `scenePalette`，`PublicPhotoView` 增加可空 `reading`；路由与错误语义不变。前端路由改为直接注册为数据路由（页面切换动画需要） |
| v0.9.9 | 2026-11-01 | **场景评审稳健性（展示录制暴露）**：评审无效先重评一次、仍无效按不通过修订而非直接兜底；评审解码容忍缺失 verdict/summary 与多对象输出，结构化重试带失败原因；构建阶段崩溃使用独立的一次修复额度（`scene_runs.build_repairs`，不计入 attempts）；被拒代码留存到 `DATA_DIR/scene-diagnostics`；取消通用兜底题面（生成失败即 Failed 并提示重试）；结构化调用改流式；题面上限 2000 字；代码上限 1MB。接口与契约不变 |
| v0.10.0 | 2026-11-02 | **阶段 1 契约冻结（位置与地图）**：位置来源/状态/公开粒度、`gallery.photo_locations`、3 条消息路由（30 → 33）、`ExhibitionDetail`/`PublicExhibitionView` 增加 `locations`、发布快照冻结公开位置与旧快照兼容、`hasUnpublishedChanges` 公开位置投影维度、`UPSTREAM_UNAVAILABLE`（503）与 5 个新 reason；位置写入只刷新 `updated_at`。工作台分区 4 → 5（新增地图），公开地图在进入 3D 后展示。仅新上传 JPEG APP1 EXIF GPS 产生建议，PNG/WebP 不产生、既有照片不回填。契约 v1.7 |
| v0.10.1 | 2026-11-03 | **阶段 1.5 契约冻结（作者主页跨展览足迹）**：`AuthorPageView` 增加 `journeyLocations`（只来自 active 快照的 area/exact 位置；展览 publishedAt 倒序、同展览按快照照片顺序；旧快照 []）；作者主页新增只读足迹地图（聚类、点击放大，v1 不做时间/展览过滤）。路由仍 33、样例仍 64，不新增 reason/错误码。契约 v1.8 |
| v0.11.0 | 2026-11-03 | **阶段 2 契约冻结（共同投稿）**：gallery 新增 `contribution_invites`/`exhibition_contributors`/`contributions`/`photo_memories`；11 条消息路由 + 2 条二进制路由（消息 33 → 44、非消息 6 → 8）、`PhotoView`/`PublicPhotoView.memories`、快照冻结讲述与署名（旧快照 []）；投稿上传先建 draft（不暴露上传中间态）、编辑后转 submitted，采用按版本核对、同目标原地更新；新增 6 个 400 与 5 个 409 reason；工作台第 6 分区「投稿」、邀请页与我的投稿页、公开页署名讲述。契约 v1.9 |
| v0.11.1 | 2026-11-03 | **阶段 2.5 回忆优先投稿**：一条投稿 = 一段回忆（提交必填）+ 0/1 张照片 + 可选地点，照片不再是创建前提；status 增加 declined（未被采用，可编辑后重提）；新增 `createcontribution`/`declinecontribution`（消息 44 → 46），`updatecontribution` 增加 submit/removePhoto；`ContributionSummary.file` 可空；照片配额只统计有照片投稿、纯文字不限条数；contributions 图片列可空并新增 declined_at（幂等迁移）；工作台审阅支持拒绝/无照片关联已有照片/有照片二选一，邀请页与我的回忆按回忆优先后文案。契约 v1.10 |
| v0.11.2 | 2026-11-03 | **阶段 2.6 建议图注**：投稿新增可选 `suggestedCaption`（0–120 码点、trim 空为 null、控制字符 400 `CONTRIBUTION_CAPTION_INVALID`）；`Create/UpdateContributionRequest` 增加该字段，`ContributionSummary` 始终输出可空 `suggestedCaption`；采用新建照片时 caption 缺失/null 回退建议图注、显式空串写空、非空用该值，关联已有照片忽略 caption 且不改原图注；contributions 增加 `suggested_caption`（幂等 ADD COLUMN）；我的回忆/审阅卡片/采用预填与策展图注编辑 UX。路由仍 46+8、样例仍 91。契约 v1.11 |
| v0.11.3 | 2026-11-03 | **阶段 2.7 采用生命周期语义补丁**：`removememory`/`withdrawcontribution` 清理由投稿新建且无其他讲述的草稿照片（被 active 发布快照引用→归档、公开不变；否则物理删除+删文件），已有照片只删讲述；`exhibition_photos` 增加内部字段 `adopted_from_contribution_id`（不进入 API）并按 photo_memories 时间戳幂等回填；已发布快照不可变。无 API 字段/路由变化，路由仍 46+8、样例仍 91。契约 v1.11.1 |
| v0.12.0 | 2026-11-04 | **阶段 2.8 投稿必须带图、移除关联已有照片**：一条投稿 = 1 张必填照片 + 回忆 + 可选建议图注/地点；draft 可暂未附图，submit 必须已有照片；`CreateContributionRequest` 去掉 submit（只建 draft），`AdoptContributionRequest` 去掉 targetPhotoId（只新建草稿照片），update 的 removePhoto 仅 draft、对 submitted/declined 返回 CONTRIBUTION_PHOTO_REQUIRED；新 submitted/declined 必有照片，历史纯文字仅兼容查看/撤回/拒绝/补图后重提。路由仍 46+8、样例仍 91（只更新样例）。契约 v1.12 |
| v0.12.1 | 2026-11-04 | **阶段 3 AI 地点候选**：新增 3 条 curation 消息路由 `suggestphotolocation`/`getphotolocationcandidates`/`confirmphotolocationcandidate`（消息 46 → 49），新增 `curation.photo_location_candidates` 候选表；AI 只产生候选（最多 5，模型要求最多 3）、不自动确认/公开，重跑事务内替换候选但不覆盖已确认 `photo_locations`；确认复制候选为 photo_locations（source=ai、status=confirmed、hidden/area/exact，无坐标只能 hidden），不递增 curationVersion、不使场景过期；独立 `LocationModel`（`photo-location-v1`），AI 只用去元数据/重编码展示图，不携带 photoId/业务 ID/token/私密位置；无新增 reason，样例 91 → 97（3 消息×2）。地图分区增加 AI 识别入口与候选确认 UI。契约 v1.13 |
| v0.13.0 | 2026-11-04 | **阶段 4 场景自然语言修订**：新增 2 条 scene 消息路由 `revisescene`/`acceptscenerun`（消息 49 → 51）；`scene_runs` 增加 kind（generate/revise/restore）、parent_run_id、revision_instruction 并回填旧行；`exhibitions.current_scene_run_id` 显式指针（独立一次性 JVM 迁移回填、无运行期兜底）；普通生成/恢复成功自动切指针，修订成功仅候选、acceptscenerun 才采用；`ExhibitionDetail` 区分 currentSceneRun/sceneRun，`SceneRunView`/`SceneRunSummary` 增加 kind/parentRunId/revisionInstruction/isCurrent/acceptable；发布、sceneStale、配色、hasUnpublishedChanges、照片档案题面、历史当前标记、恢复幂等改按指针；新增 2 个 400（SCENE_INSTRUCTION_INVALID/SCENE_REVISION_TOO_LARGE）与 2 个 409（SCENE_REVISION_STALE/SCENE_RUN_NOT_ACCEPTABLE）reason；样例 97 → 101。契约 v1.14 |
| v0.13.1 | 2026-11-04 | **前端导航重构（接口不变）**：顶栏主导航并列「我的展览」「我参与的」；用户菜单收纳账户设置、作者主页与登出；「我的回忆」更名「我参与的」；`/` 按角色分流；回忆页/账户页移除对「我的展览」的返回链接；展览列表顶栏不再单独放作者主页入口。 |
| v0.13.2 | 2026-11-04 | **走查问题第一批修复（前端，接口不变）**：场景过期时场景分区显示横幅、页签徽标显示「已过期」，并禁用过期场景的自然语言修订；投稿审阅缩略图可放大、已采用讲述带缩略图、空分区不占版面、不再外露 MIME/模型名/照片 ID 片段；照片称呼统一为「图注 → 原文件名」；策展缩略图加大可放大；空馆页对有参与记录者指向「我参与的」；登出回干净的登录页；打开投稿编辑器回到顶部；公开页进入场景加载提示；场景版本详情显示修订要求。 |
| v0.14.0 | 2026-11-04 | **走查问题第二批修复（契约 v1.15，只增字段）**：`ExhibitionSummary`/`ExhibitionDetail` 增加 `pendingContributionCount`（展览卡片、统计条、工作台「投稿」页签徽标）；`AdoptContributionRequest` 增加可选 `groupId`（采用时放进章节末尾，缺省未分组，原地更新忽略，章节不属于本展览 404）；`SceneRunSummary` 增加 `revisionInstruction`；待确认更新并排对照已采用/最新版本；过期场景的旧修订候选禁用采用；策展页「采用 AI 建议图注」。路由仍 51+8，样例仍 101（只更新 5 份）。 |
| v0.14.1 | 2026-11-04 | **走查问题第三批修复（契约 v1.16，只增字段）**：`ContributionSummary` 增加 `exhibitionPublished`/`memoryPublished`（投稿者看到回忆去向与「查看公开展览」；创建者审阅列表同样带这两个字段）；投稿编辑器地点支持地名搜索与可选地图点选；`scripts/demo/seed.ps1` 重写为覆盖投稿、采用进章节、AI 地点候选、场景修订候选、待确认更新的整套演示数据。详见走查记录 §11。 |
| v0.15.0 | 2026-11-05 | **走查问题第四批修复（契约 v1.17，只增字段）**：采用的投稿讲述进入主题建议/对话修订/场景父题面（`scene-parent-v3.5`），讲述文字变化与移除使场景过期，编辑器/邀请页/采用对话框告知；`ContributionInvitePreview` 增加 `inviterName`，邀请页显示邀请人。详见走查记录 §13。 |
| v0.15.1 | 2026-11-05 | **修订候选持久放弃（契约 v1.18）**：新增 `dismissscenerun`，放弃的成功修订候选写入服务端（`SceneRunView.dismissed`），刷新或换会话后不再弹出；历史保留且可恢复为新运行，不能直接采用；重复放弃幂等，采用与放弃同一运行时由行锁串行化。同批前端修复：截图 capturing 阶段 30 秒超时与手动重试、放弃后当前场景预览、隐藏分区不提前加载图片。 |
| v0.15.2 | 2026-11-05 | **版本历史标注已放弃候选（契约 v1.19，只增字段）**：`SceneRunSummary` 增加 `dismissed`，历史里显示「已放弃 · 不再提示」。同批前端：受保护图片共享缓存（令牌隔离、引用计数、版本化 URL）、分区栏滚动到当前项与红点读屏文案、采用对话框改原生 `<dialog>`、公开页大图与用户菜单焦点管理、截图帧率不足自动重截、工作台默认进「照片」、「我参与的」支持粘贴邀请链接/邀请码、「我的展览」页脚改深色通栏。 |
