# Momentarium API 契约（v1.19，2026-11-05）

- 状态：v1.19，与 `docs/specification.md` v0.15.2 对齐
- 定位：前后端字段级契约的唯一基准。实现与契约不一致时，先改本文件，再同时改两侧代码
- 覆盖：52 条注册路由 + 1 条内部消息 + 8 条非消息路由
- 变更规则：增删字段、改类型、改可空性、改错误语义，必须在同一次修改中更新本文件、Scala 对象与 TS 类型
- 版本记录：v1.1 对齐 spec v0.9；reason 码按 400/409 分层；非消息路由更正为 6 条。v1.2（2026-10-29）：`SceneRunView` 增加 `createdAt`（ISO-8601，运行创建时间；前端据此显示已用时间），scene 四份响应样例同步
- v1.3（2026-10-29）：仅改封面不递增策展版本、不使已有有效场景过期；`renderKey` 明确为规范裸 UUID；静态 WebP 可解码，动画 WebP 按 `UPLOAD_UNSUPPORTED_TYPE` 拒绝。HTTP 路由、JSON 字段和错误结构不变。
- v1.4（2026-10-31）：新增 8 条路由支撑四个新页面——场景版本历史（`listsceneruns`/`getscenerunbyid`/`restorescenerun`）、照片记忆档案（`getphotoinsights`）、账户设置（`getmyprofile`/`updatemyprofile`/`changepassword`）、作者主页（`getauthorpage`）；`PublicExhibitionView` 增加可空 `author`；新增 5 个 reason 码。
- v1.5（2026-10-31）：展览界面跟随场景配色、公开页展示照片 AI 解读——`ExhibitionSummary`/`ExhibitionDetail`/`PublicExhibitionView`/`AuthorExhibitionCard` 增加 `scenePalette: [String]`，`PublicPhotoView` 增加可空 `reading: PublicPhotoReading`；发布时照片解读与场景主色冻结进快照。路由、错误语义不变。
- v1.6（2026-11-02）：语义对齐 spec v0.9.9 并落实 P0-B1 公开副本，HTTP 路由与 JSON 字段不变——§4.1 设计感语义按评审提示词 v3.3 的扣档制重写（通过线 `REVIEW_PASS_SCORE` 默认 3.0；父/子生成 `scene-parent-v3.4`、评审 `scene-review-v3.3`、修复 `scene-repair-v3.2`；四视角评审与四面成立检查）；构建阶段崩溃改用独立构建修复额度，生成失败不再走通用兜底题面；§5.2/§5.4 明确公开读取只返回去元数据展示副本（缺失返回 `INTERNAL`，不回退原图）；按实现更正公开读取 API 数量、`reviewscene` 与若干路由的错误列，并给保留错误码加现状注解。错误响应结构不变。
- v1.7（2026-11-02）：阶段 1（位置与地图）契约冻结——新增位置来源/状态/公开粒度类型、`gallery.photo_locations` 表语义、3 条消息路由（`setphotolocation`/`clearphotolocation`/`searchplaces`）、`ExhibitionDetail.locations` 与 `PublicExhibitionView.locations`、公开快照位置字段与旧快照兼容、`hasUnpublishedChanges` 位置维度，以及 `UPSTREAM_UNAVAILABLE`（503）+ 5 个新 reason。既有字段语义不变，新增字段只增不改；`docs/api-routes.json`、共享样例与两侧类型随实现同批落地（文档先冻结）。
- v1.8（2026-11-03）：阶段 1.5（作者主页跨展览足迹地图）契约冻结——`AuthorPageView` 增加 `journeyLocations: [AuthorJourneyLocation]`（只来自已发布快照的 area/exact 位置；展览按 `publishedAt` 倒序、同展览内按快照 `photos` 顺序；旧快照为 `[]`）。路由仍 33 条、样例仍 64 份，不新增 reason/错误码；`getauthorpage` 响应样例同步。
- v1.9（2026-11-03）：阶段 2（共同投稿）契约冻结——gallery 新增邀请、参与、投稿、采用四类表与 **11 条消息路由 + 2 条二进制路由**（消息 33 → 44，非消息 6 → 8）；`PhotoView`/`PublicPhotoView` 增加已采用讲述 `memories`，发布快照 `SnapshotPhoto.memories` 冻结讲述与署名（旧快照 `[]`）；投稿上传先建 `draft`、编辑后转 `submitted`，采用按版本核对并支持同目标原地更新；新增 6 个 400 reason 与 5 个 409 reason（不新增 ErrorCode）。共享样例 64 → 87。
- v1.10（2026-11-03）：阶段 2.5（回忆优先投稿）契约冻结——一条投稿 = 一段回忆（提交时必填）+ 0/1 张照片 + 可选地点，照片不再是创建前提；`ContributionSummary.file` 改为可空、status 增加 `declined`；新增 2 条消息路由 `createcontribution`/`declinecontribution`（消息 44 → 46），`updatecontribution` 增加 `submit`/`removePhoto`；照片配额只统计有照片投稿、纯文字不限条数；图片列可空 + `declined_at` 由幂等迁移添加；新增 1 个 400 reason 与 2 个 409 reason。共享样例 87 → 91。
- v1.11（2026-11-03）：阶段 2.6（建议图注）契约冻结——投稿新增可选 `suggestedCaption`（0–120 个 Unicode 码点，trim 空为 `null`，控制字符 400 `CONTRIBUTION_CAPTION_INVALID`）；`CreateContributionRequest`/`UpdateContributionRequest` 增加该字段，`ContributionSummary` 始终输出可空 `suggestedCaption`；`adoptcontribution` 新建照片时 `caption` 缺失/null 回退到投稿建议图注、显式空串写空、非空用该值，关联已有照片忽略 `caption` 且不改原图注；gallery 增加 `suggested_caption` 列（幂等 ADD COLUMN）。路由仍 46+8、样例仍 91（只更新样例，不新增文件）。
- v1.11.1（2026-11-03，语义补丁，无 API 字段/路由变化）：`removememory` 与 `withdrawcontribution` 增加采用生命周期清理——采用新建且移除讲述后无其他讲述的草稿照片（不要求 origin 投稿等于当前投稿），在未被 **active 发布快照**引用时物理删除并删文件，被 active 发布快照引用时归档、公开页不变；已有照片目标只删讲述、保留照片；已 withdrawn 的投稿撤回时仍先补清理遗留 adoption。`exhibition_photos` 增加内部字段 `adopted_from_contribution_id`（不进入 API），旧数据按 `photo_memories` 时间戳幂等回填。已发布快照不可变；清理只作用于草稿并标记未发布修改。路由仍 46+8、样例仍 91。
- v1.12（2026-11-04）：阶段 2.8（投稿必须带图、移除关联已有照片）契约冻结——`CreateContributionRequest` 去掉 `submit`（只创建 draft），`AdoptContributionRequest` 去掉 `targetPhotoId`（只新建草稿照片）；`updatecontribution` 的 `submit=true` 必须已有照片（否则 400 `CONTRIBUTION_PHOTO_REQUIRED`），`removePhoto=true` 仅允许 draft；提交态不再允许纯文字，历史纯文字投稿仅保留查看/撤回/拒绝与补图后重提兼容；`ContributionSummary.file` 仍可空仅用于历史数据。路由仍 46+8、样例仍 91（只更新样例）。
- v1.13（2026-11-04）：阶段 3（AI 地点候选）契约冻结——新增 3 条 curation 消息路由 `suggestphotolocation`/`getphotolocationcandidates`/`confirmphotolocationcandidate`（消息 46 → 49，非消息仍 8），新增 `curation.photo_location_candidates` 候选表；AI 只产生候选、不自动确认/公开，重跑替换候选但不覆盖已确认 `photo_locations`；确认复制候选到 `photo_locations`（source=ai、status=confirmed、选择公开粒度），不递增 `curationVersion`、不使场景过期。无新增 reason；共享样例 91 → 97。
- v1.14（2026-11-04）：阶段 4（场景自然语言修订）契约冻结——`scene.scene_runs` 增加 `kind`（generate/revise/restore）、`parent_run_id`、`revision_instruction` 并回填旧行 kind；`gallery.exhibitions` 增加 `current_scene_run_id` 显式指针（旧展览由独立一次性 JVM 迁移回填最新成功运行，不挂常规启动、无运行期兜底）；新增 2 条 scene 消息路由 `revisescene`/`acceptscenerun`（消息 49 → 51，非消息仍 8）；`SceneRunView` 增加 `kind`/`parentRunId`/`revisionInstruction`/`isCurrent`，`SceneRunSummary` 增加 `kind`/`parentRunId`/`isCurrent`/`acceptable`；`ExhibitionDetail` 显式区分 `currentSceneRun`（指针）与 `sceneRun`（最新运行）；修订成功只是候选、`acceptscenerun` 才切指针，普通生成/恢复成功自动切指针；发布仍只冻结快照，公开页在重新发布前不变；新增 400 `SCENE_INSTRUCTION_INVALID`/`SCENE_REVISION_TOO_LARGE` 与 409 `SCENE_REVISION_STALE`/`SCENE_RUN_NOT_ACCEPTABLE`；共享样例 97 → 101。
- v1.15（2026-11-04，走查问题第二批，只增字段、路由与错误码不变）：`ExhibitionSummary`/`ExhibitionDetail` 增加 `pendingContributionCount: Int`（该展览待创建者处理的投稿数：`status=submitted` 且（未采用，或投稿版本高于已采用版本），与工作台「待审回忆」口径一致；草稿/未被采用/已撤回不计）；`AdoptContributionRequest` 增加可选 `groupId: UUID?`（首次采用时把新建的草稿照片放进该章节末尾，缺省/`null` 仍落入未分组；原地更新忽略；章节不属于该展览返回 404）；`SceneRunSummary` 增加可空 `revisionInstruction`（修订运行的修订要求，其余运行为 `null`）。共享样例数量不变（只更新 `listmyexhibitions`/`getexhibition`/`updatecuration` 响应、`adoptcontribution` 请求与 `listsceneruns` 响应）。
- v1.16（2026-11-04，走查问题第三批，只增字段、路由与错误码不变）：`ContributionSummary` 增加 `exhibitionPublished: Boolean`（该展览当前有生效的发布版本）与 `memoryPublished: Boolean`（这条投稿被采用的讲述已经出现在当前发布版本里：该发布快照中对应照片带有同样正文与署名的讲述；未采用、展览未发布、或采用发生在发布之后都为 `false`），供投稿者在「我参与的」看到回忆的去向，创建者审阅列表同样带这两个字段。共享样例数量不变（只更新 `listcontributions`/`createcontribution`/`updatecontribution`/`declinecontribution` 响应与 `contributionupload` 响应）。
- v1.17（2026-11-05，走查问题第四批，只增字段、路由与错误码不变）：`ContributionInvitePreview` 增加 `inviterName: String`（邀请人展示名：创建者资料的 `displayName`，未设置时退回用户名；不含用户名以外的任何账号信息；仍只凭有效令牌可读，无效令牌 404 不泄露）。共享样例数量不变（只更新 `getcontributioninvite` 响应）。
- v1.19（2026-11-05，只增字段）：`SceneRunSummary` 增加 `dismissed: Boolean`（该运行已被创建者放弃；旧行 `false`），版本历史据此标注「已放弃」；路由、错误码、样例数量不变（只更新 `listsceneruns` 响应）。
- v1.18（2026-11-05）：新增 `dismissscenerun`，持久放弃未采用的成功修订候选；`SceneRunView.dismissed: Boolean` 明确候选是否已放弃，旧行默认 false。已放弃候选保留历史，可恢复为新运行，但不得直接采用；重复放弃幂等。采用与放弃同一运行时通过行锁串行化。
- 复核：2026-11-02 按 spec v0.9.9 与 P0-B1 展示副本实现复核并升为 v1.6，随后完成阶段 1 位置契约冻结升为 v1.7、阶段 1.5 作者主页足迹契约冻结升为 v1.8、阶段 2 共同投稿契约冻结升为 v1.9、阶段 2.5 回忆优先投稿契约冻结升为 v1.10、阶段 2.6 建议图注契约冻结升为 v1.11、阶段 2.7 采用生命周期语义补丁升为 v1.11.1、阶段 2.8 投稿必须带图契约冻结升为 v1.12、阶段 3 AI 地点候选契约冻结升为 v1.13、阶段 4 场景自然语言修订契约冻结升为 v1.14（见版本记录），本版增路由/字段/指针语义，既有字段语义变化处已在 §2/§4 标注。

## 0. 通用约定

- 消息路由：`POST /api/{routeName}`，`Content-Type: application/json`；无请求消息传 `{}`。
- 认证：`Authorization: Bearer <token>`；需要令牌的消息缺失/无效令牌返回 401。
- 身份边界：HTTP 请求不接收可信 `userId`；需要认证的路由先解析令牌，再把可信 `UserId` 注入内部消息构造参数。因此内部消息与 HTTP 请求的身份字段有意不同，不是字段漂移。公开路由无需令牌；三个公开读取 API（`getpublishedexhibition`、`getpublishedscene`、`getauthorpage`）显式匿名发送，即使当前浏览器已登录也不附带令牌。
- 命名：两侧分别经共享 `RouteName` / `apiName` 推导小写名称；既有 `PublishExhibitionMessage` 显式注册为 `publish`，前端对应 `PublishAPI`，保留该兼容映射。
- 成功响应：HTTP 200，body 即响应对象；`EmptyResponse` 为 `{}`。
- 失败响应：

```json
{ "error": { "code": "VALIDATION", "message": "展览至少需要 3 张照片", "details": { "reason": "PHOTO_COUNT" } } }
```

- 字段命名 `camelCase`；`Option` 序列化为 `null`（不省略字段）；时间 ISO-8601 UTC（如 `2026-10-27T08:00:00Z`）；ID 为 UUID 字符串；枚举为小写字符串；图片 URL 为相对路径（前端按当前 origin 拼接）。
- 列表不分页（MVP 单人使用）；字段顺序无契约意义。

### 0.1 错误码

| code | HTTP | 语义 |
|---|---|---|
| `BAD_REQUEST` | 400 | 请求 JSON/字段格式错误 |
| `VALIDATION` | 400 | 业务校验失败，`details.reason` 为稳定原因码 |
| `UNAUTHORIZED` | 401 | 未登录、令牌无效或过期 |
| `FORBIDDEN` | 403 | 已登录但无权操作（保留码；当前实现没有产出该 code 的路径） |
| `NOT_FOUND` | 404 | 资源不存在或不可见（越权也返回 404） |
| `CONFLICT` | 409 | 状态冲突（非 `AwaitingCapture` 回传截图、终态取消等） |
| `MODEL_FAILURE` | 502 | 模型调用失败或输出不可解析（已重试） |
| `UPSTREAM_UNAVAILABLE` | 503 | 外部依赖（地点搜索提供方）不可用、超时或被拒绝；当前仅用于 `searchplaces` |
| `GENERATION_FAILED` | —（运行级） | 场景生成失败的运行级原因：只写进 `scene_runs.error_code`（见 `SceneRunView.errorCode`），不是 HTTP 错误响应 |
| `INTERNAL` | 500 | 未预期错误（响应不含堆栈） |

### 0.2 reason 码（固定集合）

`details.reason` 在 400、409 与 503 `UPSTREAM_UNAVAILABLE` 上都适用；前端按键值分支处理，禁止匹配 `message` 文本；新增 reason 必须两侧同步。

- 400 `VALIDATION`：`TITLE_REQUIRED`、`PHOTO_COUNT`、`PHOTO_UNGROUPED`、`GROUP_EMPTY`、`SCENE_NOT_READY`、`SCENE_STALE`、`PHOTO_LIMIT`、`UPLOAD_TOO_LARGE`、`UPLOAD_UNSUPPORTED_TYPE`、`INVALID_COVER`、`COVER_TOO_LARGE`、`COVER_UNSUPPORTED_TYPE`、`USERNAME_INVALID`、`PASSWORD_WEAK`、`SCENE_RUN_NOT_RESTORABLE`、`DISPLAY_NAME_INVALID`、`BIO_TOO_LONG`、`PASSWORD_INCORRECT`、`LOCATION_NAME_INVALID`、`LOCATION_COORDINATES_INVALID`、`LOCATION_GRANULARITY_INVALID`、`PLACE_QUERY_INVALID`、`CONTRIBUTION_MEMORY_INVALID`、`CONTRIBUTION_BATCH_LIMIT`、`CONTRIBUTION_QUOTA_PHOTOS`、`CONTRIBUTION_QUOTA_BYTES`、`CONTRIBUTION_SELF_NOT_ALLOWED`、`CONTRIBUTION_PHOTO_REQUIRED`、`CONTRIBUTION_CAPTION_INVALID`、`SCENE_INSTRUCTION_INVALID`、`SCENE_REVISION_TOO_LARGE`。
- 409 `CONFLICT`：`USERNAME_TAKEN`、`VERSION_CONFLICT`、`SCENE_RUN_ACTIVE`、`SCENE_REVISION_STALE`、`SCENE_RUN_NOT_ACCEPTABLE`、`INVITE_CLOSED`、`PARTICIPANT_REVOKED`、`CONTRIBUTION_WITHDRAWN`、`CONTRIBUTION_VERSION_CONFLICT`、`CONTRIBUTION_TARGET_CONFLICT`、`CONTRIBUTION_ALREADY_ADOPTED`、`CONTRIBUTION_DECLINED`。
- 503 `UPSTREAM_UNAVAILABLE`：`PLACE_SEARCH_UNAVAILABLE`（外部地点搜索不可用/超时/被限流拒绝；搜索“无结果”不是错误，返回 200 + 空 `candidates`）。
- 上传单文件失败：`UPLOAD_TOO_LARGE` / `UPLOAD_UNSUPPORTED_TYPE` 只作为 200 上传响应的 `failures[].reason` 出现（见 §5.1、§5.5），不是 HTTP error 的 `details.reason`；上传批量超限使用 `PHOTO_LIMIT`（照片）或 `CONTRIBUTION_BATCH_LIMIT`/`CONTRIBUTION_QUOTA_*`（投稿）。

## 1. users

### 1.1 对象

```text
UserView(id, username, createdAt)
AuthResponse(token, user: UserView)
RegisterRequest(username, password)
LoginRequest(username, password)
EmptyResponse {}
ProfileView(username, displayName, bio, homepagePublic: Boolean, createdAt)
UpdateMyProfileRequest(displayName, bio, homepagePublic: Boolean)
ChangePasswordRequest(currentPassword, newPassword)
```

校验：`username` 3–32 字符，仅字母/数字/下划线；`password` 8–72 字符。令牌 30 天有效。`displayName` 去首尾空白后 1–32 字、`bio` 去首尾空白后 ≤200 字（均按 Unicode 码点计）。没有资料行时 `getmyprofile` 返回默认值：显示名=用户名、简介空、`homepagePublic=false`。

### 1.2 路由

| 路由 | 类 | 认证 | 请求 | 响应 | 错误 |
|---|---|---|---|---|---|
| `register` | `RegisterMessage` | 公开 | `RegisterRequest` | `AuthResponse` | VALIDATION(`USERNAME_INVALID`/`PASSWORD_WEAK`), CONFLICT(`USERNAME_TAKEN`) |
| `login` | `LoginMessage` | 公开 | `LoginRequest` | `AuthResponse` | UNAUTHORIZED |
| `getcurrentuser` | `GetCurrentUserMessage` | 令牌 + 无请求 | `{}` | `UserView` | UNAUTHORIZED |
| `logout` | `LogoutMessage` | 令牌 + 无请求 | `{}` | `EmptyResponse` | UNAUTHORIZED |
| `getmyprofile` | `GetMyProfileMessage` | 令牌 + 无请求 | `{}` | `ProfileView` | UNAUTHORIZED |
| `updatemyprofile` | `UpdateMyProfileMessage` | 令牌 | `UpdateMyProfileRequest` | `ProfileView` | VALIDATION(`DISPLAY_NAME_INVALID`/`BIO_TOO_LONG`) |
| `changepassword` | `ChangePasswordMessage` | 令牌 | `ChangePasswordRequest` | `AuthResponse` | VALIDATION(`PASSWORD_INCORRECT`/`PASSWORD_WEAK`) |

`changepassword` 成功后该用户全部旧令牌失效（会话表无设备信息，按用户整体吊销），响应携带新令牌；当前密码错误返回 400 而非 401（401 表示会话失效）。

### 1.3 内部消息（不注册路由）

| 类 | 请求 | 响应 | 说明 |
|---|---|---|---|
| `ResolveSessionMessage` | `rawToken: String` | `SessionView(userId)` | 路由器专用；无效令牌抛 UNAUTHORIZED |

## 2. gallery

### 2.1 对象

```text
CreateExhibitionRequest(title)                 → CreateExhibitionResponse(exhibitionId)
MyExhibitionsResponse(exhibitions: [ExhibitionSummary])
ExhibitionSummary(id, title, photoCount, updatedAt,
                  cover: CoverView, sceneStale: Bool, publication: PublicationSummary?,
                  hasUnpublishedChanges: Bool, pendingContributionCount: Int,   // v1.15
                  scenePalette: [String])
PublicationSummary(version, publishedAt)
CoverView(kind: "auto"|"photo"|"render", imageUrl, width, height)

ExhibitionDetail(id, title, narrative, updatedAt,
                 groups: [GroupView], ungroupedPhotos: [PhotoView],
                 currentSceneRun: SceneRunView?, sceneRun: SceneRunView?, sceneStale: Bool,
                 cover: CoverView, publication: PublicationSummary?,
                 hasUnpublishedChanges: Bool, pendingContributionCount: Int,   // v1.15
                 scenePalette: [String], locations: [PhotoLocationView])
GroupView(id, title, narrative, position, photos: [PhotoView])
PhotoView(id, originalName, mime, width, height, caption,
          groupId: UUID?, positionInGroup: Int?, contentUrl, thumbUrl,
          memories: [PhotoMemoryView])          // v1.9：草稿照片已采用的讲述
PhotoMemoryView(memoryId, text, contributorName)   // 作者视图；含 id 以支持移除
ExhibitionPhotoInput(photoId, caption)
GroupInput(title, narrative, photos: [ExhibitionPhotoInput])

SetCoverRequest(exhibitionId, kind: "auto"|"photo"|"render", photoId: UUID?, renderKey: String?)

PublishExhibitionResponse(version, publishedAt)
PublicExhibitionView(id, version, title, narrative, narration,
                     cover: CoverView, groups: [PublicGroupView],
                     photos: [PublicPhotoView], publishedAt, author: PublicAuthorView?,
                     scenePalette: [String], locations: [PublicPhotoLocation])
PublicAuthorView(username, displayName)          // 仅作者在账户设置中开启主页时非空
PublicGroupView(id, title, narrative, position, photos: [PublicPhotoView])
PublicPhotoView(id, width, height, caption, contentUrl, thumbUrl, reading: PublicPhotoReading?,
                memories: [PublicPhotoMemory])   // v1.9：已采用讲述（旧快照 []）
PublicPhotoMemory(text, contributorName)          // 不公开来源投稿 id/账号
PublicPhotoReading(palette: [String], poeticLine, sensory)   // 视觉模型的画面主色/配文/感官描写，发布时冻结
GetAuthorPageRequest(username)
AuthorPageView(username, displayName, bio, exhibitions: [AuthorExhibitionCard],
               journeyLocations: [AuthorJourneyLocation])   // 展览最近发布在前
AuthorExhibitionCard(id, title, narration, cover: CoverView, version, publishedAt,
                     scenePalette: [String])  // 取自 active 快照
AuthorJourneyLocation(exhibitionId, exhibitionTitle, photoId, name, latitude, longitude,
                      granularity: "area"|"exact")   // 只来自已发布快照的 confirmed 公开位置

LocationSource = "exif"|"manual"|"ai"
LocationStatus = "suggested"|"confirmed"                 // unknown = 无记录
LocationGranularity = "hidden"|"area"|"exact"
PhotoLocationView(photoId, source, status, name, latitude: Double?, longitude: Double?, granularity)
PublicPhotoLocation(photoId, name, granularity: "area"|"exact", latitude, longitude)   // 无 hidden/suggested
SetPhotoLocationRequest(photoId, name, latitude: Double?, longitude: Double?, granularity)
ClearPhotoLocationRequest(photoId)
SearchPlacesRequest(query)                                // query 1–200 个 Unicode 码点
PlaceCandidate(name, displayName, latitude, longitude)
PlaceSearchResponse(candidates: [PlaceCandidate])         // []=无结果

# 阶段 2 共同投稿（v1.9；v1.10 回忆优先）
CreateContributionInviteRequest(exhibitionId) → ContributionInviteCreated(inviteId, token, createdAt)
ContributionInviteSummary(id, status: "active"|"closed", createdAt, closedAt: Instant?)
GetContributionManagementRequest(exhibitionId) → ContributionManagementResponse(invites: [ContributionInviteSummary],
                                                                               participants: [ContributorView])
ContributorView(contributorId, username, displayName, status: "active"|"revoked", joinedAt, contributionCount)
CloseContributionInviteRequest(exhibitionId, inviteId) → ContributionInviteSummary
GetContributionInviteRequest(token) → ContributionInvitePreview(exhibitionTitle, inviterName,   // inviterName v1.17
                          status: "active"|"closed")
JoinContributionRequest(token) → ContributionMembershipView(exhibitionId, exhibitionTitle, status, joinedAt)
RevokeContributorRequest(exhibitionId, contributorId) → EmptyResponse

ListContributionsRequest(exhibitionId: UUID?) → ContributionsResponse(contributions: [ContributionSummary])
ContributionSummary(id, exhibitionId, exhibitionTitle,
                    contributor: ContributorBrief(contributorId, username, displayName),
                    status: "draft"|"submitted"|"declined"|"withdrawn", version, memoryText,
                    suggestedCaption: String?,
                    location: ContributionLocationView?, file: ContributionFileView?,
                    adoption: ContributionAdoptionView?, hasPendingUpdate: Boolean,
                    exhibitionPublished: Boolean, memoryPublished: Boolean,   // v1.16
                    createdAt, updatedAt, withdrawnAt: Instant?)
ContributionLocationView(name, latitude: Double?, longitude: Double?, source: "exif"|"manual")
ContributionLocationInput(name, latitude: Double?, longitude: Double?)
ContributionFileView(mime, width: Int?, height: Int?, contentUrl, thumbUrl)
ContributionAdoptionView(contributionId, photoId, memoryId, adoptedVersion)
CreateContributionRequest(exhibitionId, memoryText, suggestedCaption: String?,
                          location: ContributionLocationInput?)
  → ContributionSummary                       // 只创建 draft；提交走 updatecontribution
UpdateContributionRequest(contributionId, memoryText, suggestedCaption: String?,
                          location: ContributionLocationInput?,
                          submit: Boolean, removePhoto: Boolean) → ContributionSummary
DeclineContributionRequest(contributionId, expectedVersion) → ContributionSummary
WithdrawContributionRequest(contributionId) → EmptyResponse
AdoptContributionRequest(contributionId, expectedVersion, caption: String?,
                         location: AdoptedLocationInput?,
                         groupId: UUID?) → ContributionAdoptionView   // groupId v1.15
AdoptedLocationInput(name, latitude: Double?, longitude: Double?, granularity: "hidden"|"area"|"exact")
RemoveMemoryRequest(photoId, memoryId) → EmptyResponse

ContributionUploadResponse(contributions: [ContributionSummary],
                           failures: [ContributionUploadFailure])
ContributionUploadFailure(fileName, reason: "UPLOAD_TOO_LARGE"|"UPLOAD_UNSUPPORTED_TYPE")
```

规则：

- `cover`：`auto` = 当前草稿第一章第一张照片；`photo` = 选定照片；`render` = 上传的场景渲染图（见 5.3）。
- `sceneStale`（v1.14）：无当前采用场景（`currentSceneRun=null`），或当前采用运行的 `photoIds`/`curationVersion` 与当前草稿不一致；未采用的最新候选不影响该判断。
- `hasUnpublishedChanges`：存在 active 快照，且草稿 `curationVersion`/封面/标题/叙事与快照不同，或**当前采用场景指针** `currentSceneRun` 不是快照绑定的 `sceneRunId`（重新生成/恢复/采用修订后需重新发布；v1.4）；只生成未采用修订候选不算未发布修改（v1.14）。v1.7 起还包括公开位置投影变化（见下）。
- `getpublishedexhibition` 只返回 active 快照，草稿内容不可见。
- `scenePalette`（v1.5；v1.14 起按指针）：场景题面的主色（`#RRGGBB`，题面校验保证 3–5 个），前端据此推导展览界面配色；草稿视图取 `currentSceneRun` 的主色，候选预览需单独使用候选运行的主色；公开视图与作者主页卡片取快照绑定的运行；没有当前场景、或快照早于 v1.5 时为 `[]`，前端退回默认配色。
- `currentSceneRun` / `sceneRun`（v1.14）：`currentSceneRun` 是 `gallery.exhibitions.current_scene_run_id` 指向的当前采用运行（可能为 `null`，如从未成功生成或迁移前的空指针）；`sceneRun` 是**最新运行**（任意状态，用于进度与候选展示，可能失败/进行中/未采用）。详情消费方不得再把 `sceneRun` 当作当前采用场景；需要当前场景时读 `currentSceneRun`。旧快照/旧库字段保持可空兼容。
- `reading`（v1.5）：发布时从照片分析缓存冻结，之后重新分析不影响已发布版本；照片发布时没有分析缓存、或快照早于 v1.5 时为 `null`。
- `locations`（v1.7，位置与地图）：作者视图返回草稿照片的 suggested/confirmed 位置，无记录=未知、不出现在数组；公开视图只含 active 快照中 confirmed 且 `granularity != hidden` 的位置，`area` 为范围代表点、不暴露原始精确坐标。数组顺序有契约意义：作者视图按照片展示顺序（章节 `position` → 组内 `positionInGroup` → `ungroupedPhotos`），公开视图按快照照片顺序。
- 位置来源/状态/粒度：`source ∈ exif|manual|ai`、`status ∈ suggested|confirmed`、`granularity ∈ hidden|area|exact`；坐标统一 WGS84，`latitude/longitude` 必须成对出现（同时为 `null` 或同时为数字），范围 `−90…90` / `−180…180`；`area`/`exact` 必须有坐标，`hidden` 可只标地名。阶段 1 只在**新上传**时本地解析 JPEG APP1 EXIF GPS 写 `suggested`（`source=exif`，名称允许空串），PNG/WebP 不产生建议、既有照片不回填；作者确认/纠正/手动标注写 `confirmed`（作者改动记 `manual`，确认既有建议保留原来源），确认写入要求名称非空（去首尾空白后 1–120 个 Unicode 码点）。
- `hasUnpublishedChanges` 的位置维度（v1.7）：比较快照 `locations` 与当前“公开位置投影”（快照照片中 confirmed 且非 hidden 的位置）；位置写入只更新 `updatedAt`，不递增 `curationVersion`，不使 `sceneStale` 变化；`suggested` 与 hidden 内部变化不计。
- 发布快照冻结公开位置（`snapshot.locations`）；快照早于 v1.7 缺该字段时公开视图返回 `[]`，不自动回填。
- `journeyLocations`（v1.8，作者主页跨展览足迹）：由作者全部 active 快照的 `locations` 聚合，只含 `granularity` 为 `area`/`exact` 的已确认公开位置（`hidden`/`suggested` 永不出现）；不读草稿或位置实时表。数组顺序：展览按 `publishedAt` 倒序，同一展览内按快照 `photos` 顺序；旧快照没有 `locations` 时该展览不贡献条目。作者主页关闭或用户不存在仍统一 404，不泄露足迹。
- `memories`（v1.9，已采用讲述）：作者视图 `PhotoView.memories: [PhotoMemoryView(memoryId, text, contributorName)]` 返回该草稿照片当前已采用的讲述，按采用顺序（`createdAt, id`）；公开视图 `PublicPhotoView.memories: [PublicPhotoMemory(text, contributorName)]` 只含 active 快照冻结的讲述与署名。旧快照没有该字段时公开视图返回 `[]`；来源投稿 id、投稿者账号/头像不进入公开字段。投稿后续修改/撤回不影响已发布讲述，需再次采用并重新发布。
- `hasUnpublishedChanges` 的讲述维度（v1.9）：比较快照照片 `memories` 与当前草稿已采用记忆（text + contributorName + 顺序）；仅讲述变化只更新 `updatedAt`、不递增 `curationVersion`、不使 `sceneStale` 变化；采用新照片按照片集合变化正常递增。
- 共同投稿模型与状态（v1.12，必须带图）：一条投稿 = 1 张照片 + 一段回忆 + 可选建议图注/地点；`draft` 可暂未附图（保存草稿），但 `submit=true`（提交/重提）必须已有照片且回忆为 1–1000 个 Unicode 码点，否则 400 `CONTRIBUTION_PHOTO_REQUIRED` / `CONTRIBUTION_MEMORY_INVALID`。`status ∈ draft|submitted|declined|withdrawn`：`submitted`/`declined` 在新路径下必有 `file`；历史纯文字投稿（`file=null`）仅保留查看/撤回/拒绝与“补图后重提”兼容，不再是新模型入口。创建者可用 `declinecontribution` 把未采用投稿置为 `declined`，贡献者编辑后 `submit=true` 可重新提交；`withdrawn` 为本人撤回。贡献者编辑已提交/已采用投稿时 `version+1`，创建者看到 `hasPendingUpdate`。
- `createcontribution`（v1.12）：只创建 `draft`，请求不含 `submit`；创建后可先保存回忆/建议图注/地点，照片通过 §5.5 的投稿上传以 `contributionId` 附加/替换（每条投稿最多 1 张）。提交统一走 `updatecontribution` 的 `submit=true`。
- `updatecontribution` 的提交与移除照片（v1.12）：`submit=true` 要求回忆非空且已有照片（否则 400 `CONTRIBUTION_MEMORY_INVALID` / `CONTRIBUTION_PHOTO_REQUIRED`），`draft`/`declined` 可转 `submitted`；`submit=false` 保存草稿（`declined→draft`，`submitted`/已采用保持）；`removePhoto=true` 仅允许当前 `draft`（清空照片并保持 `draft`），对 `submitted`/`declined` 返回 400 `CONTRIBUTION_PHOTO_REQUIRED`（需先替换照片，不能把已提交回忆变成无图）。
- `declinecontribution`（v1.10）：创建者按 `expectedVersion` 拒绝未采用投稿，返回更新后的 `ContributionSummary`（status=declined）；已采用返回 409 `CONTRIBUTION_ALREADY_ADOPTED`，已撤回返回 409 `CONTRIBUTION_WITHDRAWN`，版本不一致返回 409 `CONTRIBUTION_VERSION_CONFLICT`，同版本重复拒绝幂等；拒绝不删除投稿内容。
- `adoptcontribution`（v1.12）：只创建一张新草稿照片（复制投稿照片），请求不含 `targetPhotoId`；投稿必须有照片，否则 400 `CONTRIBUTION_PHOTO_REQUIRED`；不再支持关联已有照片，历史已有照片目标仅旧数据、不再由新请求产生。同一投稿后续版本再次采用同一目标时仍原地更新该新建照片（文件变化才替换变体并 `touchDraft`，仅回忆/位置/图注变化 `touchUpdatedAt`）；`declined` 投稿不可采用（409 `CONTRIBUTION_DECLINED`）；其余沿用 v1.9：事务内核对 `expectedVersion`、同版本幂等、目标锁定、`removememory`/撤回按 v1.11.1 清理规则。
- 投稿文件与配额（v1.12）：`ContributionSummary.file` 可空仅为历史纯文字数据兼容；新提交路径保证 `submitted`/`declined` 必有 `file`。照片配额（张数/字节）只统计 `file` 非空的投稿；采用后草稿仍受 30 张上限；撤回不立即释放照片配额，文件清理后才释放。上传先写临时文件，取得展览级 advisory lock 后在同一临界区检查照片配额并插入 `draft` 行，数据库失败删除文件。
- 建议图注（v1.11）：`suggestedCaption` 是投稿者给策展人的可选图注建议，0–120 个 Unicode 码点；服务端先 trim，trim 后空串存为 `null`，超过 120 码点或含控制字符（U+0000–U+001F、U+007F，含换行/制表符）返回 400 `CONTRIBUTION_CAPTION_INVALID`；允许中文、常规标点与 emoji。`CreateContributionRequest`/`UpdateContributionRequest` 接受该字段（纯文字投稿也可填），`ContributionSummary` 始终输出可空 `suggestedCaption`。修改建议图注不会自动改变已采用草稿的图注，只有再次采用时才按下面规则生效。
- 采用时放入章节（v1.15）：请求可带 `groupId`，首次采用新建的草稿照片会放进该章节末尾（`positionInGroup` = 章节内现有未归档照片数）；缺省/`null` 保持旧行为（落入未分组，策展页再放入章节）；`groupId` 不属于该展览返回 404 `NOT_FOUND`。同一投稿后续版本再次采用（原地更新）忽略 `groupId`，不会移动已有照片。章节 ID 在每次 `updatecuration` 后重新生成，前端应使用最近一次详情里的章节。
- 投稿去向（v1.16）：`exhibitionPublished` 表示该展览现在有 active 发布版本；`memoryPublished` 表示这条投稿被采用的讲述已经随当前发布版本公开（匹配口径：active 快照里该照片的讲述含同样的正文与署名）。采用发生在发布之后不算已公开，需策展人重新发布后才会为 `true`；投稿者在采用后又修改的新版本（`hasPendingUpdate`）要等策展人确认更新并重新发布才会公开，期间 `memoryPublished` 只反映已采用的旧版本是否公开。投稿者据此显示「查看公开展览」（`/show/:id`）与「已随展览公开 / 将在下次发布后公开」；两个字段只读，不接受请求写入。
- 采用时的图注（v1.12）：`adoptcontribution` 只新建草稿照片，请求 `caption` 缺失/`null` → 使用投稿的 `suggestedCaption`（该值也为 `null` 时写空串）；`caption` 显式空串 → 写空（允许策展人清空预填值）；显式非空 → 使用该值（trim 后校验 0–120 码点与控制字符，非法返回 400 `CONTRIBUTION_CAPTION_INVALID`）。历史关联已有照片目标仅旧数据，不再由新请求产生，也不再提供“已有照片图注覆盖”语义；前端采用对话框会显式提交预填值，因此“清空”语义可靠。
- 采用生命周期清理（v1.11.1）：`gallery.exhibition_photos.adopted_from_contribution_id` 是内部字段（不进入任何 API），记录该草稿照片是否由投稿“新建照片”采用创建；已有照片目标仅历史数据（字段为 `NULL`，旧数据按时间戳 fallback 识别）。`removememory` 与 `withdrawcontribution` 在删除/撤回已采用讲述时按以下规则清理草稿：
  - 目标照片是**采用新建的照片**（`adopted_from_contribution_id` 非 `NULL`，或旧数据时间戳 fallback 命中；不要求该照片的 origin 投稿就是当前被移除讲述的投稿）且删除后该照片已无其他讲述：若照片被 **active 发布快照**引用，则只归档（`archived_at` 置位，保留 row 与原始/缩略图/展示副本文件，公开页继续可读、内容不变）；否则物理删除该草稿照片 row 并删除其文件（superseded-only 引用不阻止物理删除，历史快照不公开读取且无恢复接口）。
  - 目标为历史已有照片目标（`adopted_from_contribution_id` 为 `NULL`，仅旧数据，新请求不再产生）或删除后仍有其他讲述：只删除讲述，照片保留。
  - `withdrawcontribution` 先按上述规则清理该投稿的已采用讲述，再把投稿置为 `withdrawn`；若投稿已是 `withdrawn`，仍先补清理遗留 adoption（兼容旧版本残留），再幂等返回，不重复改状态。投稿源文件不因撤回立即删除（配额按 v1.10 在清理后释放）。
  - 只删讲述时只刷新 `updatedAt` 并由讲述投影标记 `hasUnpublishedChanges`；照片被归档/物理删除时草稿照片集合变化，按既有删除照片语义 `touchDraft`（`curationVersion+1`、场景过期）。所有清理只作用于草稿，**不改写 publication 行与 snapshot JSON**：active 快照的照片/讲述保持冻结，公开页在重新发布前不变。

### 2.2 路由

| 路由 | 类 | 认证 | 请求 → 响应 | 错误 |
|---|---|---|---|---|
| `createexhibition` | `CreateExhibitionMessage` | 令牌 | `CreateExhibitionRequest` → `CreateExhibitionResponse` | VALIDATION(`TITLE_REQUIRED`) |
| `listmyexhibitions` | `ListMyExhibitionsMessage` | 令牌 + 无请求 | `{}` → `MyExhibitionsResponse` | UNAUTHORIZED |
| `getexhibition` | `GetExhibitionMessage` | 令牌 | `GetExhibitionRequest(exhibitionId)` → `ExhibitionDetail` | NOT_FOUND |
| `updateexhibitionmeta` | `UpdateExhibitionMetaMessage` | 令牌 | `UpdateExhibitionMetaRequest(exhibitionId, title, narrative)` → `EmptyResponse` | VALIDATION(`TITLE_REQUIRED`), NOT_FOUND |
| `updatecuration` | `UpdateCurationMessage` | 令牌 | `UpdateCurationRequest(exhibitionId, title, narrative, groups: [GroupInput])` → `ExhibitionDetail` | VALIDATION(`TITLE_REQUIRED`/`PHOTO_COUNT`/`PHOTO_UNGROUPED`/`GROUP_EMPTY`), BAD_REQUEST(同一照片重复), NOT_FOUND |
| `deletephoto` | `DeletePhotoMessage` | 令牌 | `DeletePhotoRequest(photoId)` → `EmptyResponse` | NOT_FOUND |
| `deleteexhibition` | `DeleteExhibitionMessage` | 令牌 | `DeleteExhibitionRequest(exhibitionId)` → `EmptyResponse` | NOT_FOUND |
| `publish` | `PublishExhibitionMessage` | 令牌 | `PublishExhibitionRequest(exhibitionId)` → `PublishExhibitionResponse` | VALIDATION(`SCENE_NOT_READY`/`SCENE_STALE`/`PHOTO_COUNT`/`PHOTO_UNGROUPED`/`GROUP_EMPTY`/`TITLE_REQUIRED`), NOT_FOUND, CONFLICT(`VERSION_CONFLICT`) |
| `getpublishedexhibition` | `GetPublishedExhibitionMessage` | 公开 | `GetPublishedExhibitionRequest(exhibitionId)` → `PublicExhibitionView` | NOT_FOUND |
| `setcover` | `SetCoverMessage` | 令牌 | `SetCoverRequest` → `CoverView` | VALIDATION(`INVALID_COVER`), NOT_FOUND |
| `getauthorpage` | `GetAuthorPageMessage` | 公开 | `GetAuthorPageRequest(username)` → `AuthorPageView` | NOT_FOUND（用户不存在与主页未开启同一响应，防枚举） |
| `setphotolocation` | `SetPhotoLocationMessage` | 令牌 | `SetPhotoLocationRequest` → `PhotoLocationView` | VALIDATION(`LOCATION_NAME_INVALID`/`LOCATION_COORDINATES_INVALID`/`LOCATION_GRANULARITY_INVALID`), NOT_FOUND |
| `clearphotolocation` | `ClearPhotoLocationMessage` | 令牌 | `ClearPhotoLocationRequest` → `EmptyResponse` | NOT_FOUND |
| `searchplaces` | `SearchPlacesMessage` | 令牌 | `SearchPlacesRequest` → `PlaceSearchResponse` | VALIDATION(`PLACE_QUERY_INVALID`), UPSTREAM_UNAVAILABLE(`PLACE_SEARCH_UNAVAILABLE`) |
| `createcontributioninvite` | `CreateContributionInviteMessage` | 令牌（创建者） | `CreateContributionInviteRequest(exhibitionId)` → `ContributionInviteCreated(inviteId, token, createdAt)` | NOT_FOUND（非本人/不存在） |
| `getcontributionmanagement` | `GetContributionManagementMessage` | 令牌（创建者） | `GetContributionManagementRequest(exhibitionId)` → `ContributionManagementResponse` | NOT_FOUND |
| `closecontributioninvite` | `CloseContributionInviteMessage` | 令牌（创建者） | `CloseContributionInviteRequest(exhibitionId, inviteId)` → `ContributionInviteSummary` | NOT_FOUND；已关闭幂等 |
| `getcontributioninvite` | `GetContributionInviteMessage` | 公开（凭令牌） | `GetContributionInviteRequest(token)` → `ContributionInvitePreview` | NOT_FOUND（无效令牌，不泄露）；关闭返回 200 status=closed |
| `joincontribution` | `JoinContributionMessage` | 令牌 | `JoinContributionRequest(token)` → `ContributionMembershipView` | NOT_FOUND（无效令牌）；VALIDATION(`CONTRIBUTION_SELF_NOT_ALLOWED`)；CONFLICT(`INVITE_CLOSED`/`PARTICIPANT_REVOKED`)；已 active 幂等 |
| `revokecontributor` | `RevokeContributorMessage` | 令牌（创建者） | `RevokeContributorRequest(exhibitionId, contributorId)` → `EmptyResponse` | NOT_FOUND；幂等 |
| `listcontributions` | `ListContributionsMessage` | 令牌 | `ListContributionsRequest(exhibitionId: UUID?)` → `ContributionsResponse` | NOT_FOUND（非本人展览/非参与者） |
| `createcontribution` | `CreateContributionMessage` | 令牌 | `CreateContributionRequest(exhibitionId, memoryText, suggestedCaption?, location?)` → `ContributionSummary`（只创建 draft） | NOT_FOUND（非参与者/无 active 参与）；VALIDATION(`CONTRIBUTION_SELF_NOT_ALLOWED`/`CONTRIBUTION_MEMORY_INVALID`/`CONTRIBUTION_CAPTION_INVALID`/`LOCATION_*`)；CONFLICT(`PARTICIPANT_REVOKED`) |
| `updatecontribution` | `UpdateContributionMessage` | 令牌 | `UpdateContributionRequest(contributionId, memoryText, suggestedCaption?, location?, submit, removePhoto)` → `ContributionSummary` | VALIDATION(`CONTRIBUTION_MEMORY_INVALID`/`CONTRIBUTION_CAPTION_INVALID`/`CONTRIBUTION_PHOTO_REQUIRED`/`LOCATION_*`), CONFLICT(`CONTRIBUTION_WITHDRAWN`/`PARTICIPANT_REVOKED`), NOT_FOUND |
| `declinecontribution` | `DeclineContributionMessage` | 令牌（创建者） | `DeclineContributionRequest(contributionId, expectedVersion)` → `ContributionSummary` | NOT_FOUND；CONFLICT(`CONTRIBUTION_ALREADY_ADOPTED`/`CONTRIBUTION_WITHDRAWN`/`CONTRIBUTION_VERSION_CONFLICT`)；同版本重复拒绝幂等 |
| `withdrawcontribution` | `WithdrawContributionMessage` | 令牌 | `WithdrawContributionRequest(contributionId)` → `EmptyResponse`；同时按 v1.11.1 清理已采用讲述/新建照片（已 withdrawn 也先补清理遗留 adoption 再幂等返回） | NOT_FOUND；重复撤回幂等 |
| `adoptcontribution` | `AdoptContributionMessage` | 令牌（创建者） | `AdoptContributionRequest(contributionId, expectedVersion, caption?, location?, groupId?)` → `ContributionAdoptionView`（只新建草稿照片；`groupId` v1.15） | VALIDATION(`PHOTO_LIMIT`/`LOCATION_*`/`CONTRIBUTION_MEMORY_INVALID`/`CONTRIBUTION_PHOTO_REQUIRED`/`CONTRIBUTION_CAPTION_INVALID`), CONFLICT(`CONTRIBUTION_VERSION_CONFLICT`/`CONTRIBUTION_WITHDRAWN`/`PARTICIPANT_REVOKED`/`CONTRIBUTION_ALREADY_ADOPTED`/`CONTRIBUTION_DECLINED`), NOT_FOUND；同版本幂等 |
| `removememory` | `RemoveMemoryMessage` | 令牌（创建者） | `RemoveMemoryRequest(photoId, memoryId)` → `EmptyResponse`；按 v1.11.1 清理采用新建且无其他讲述的草稿照片 | NOT_FOUND；幂等 |

语义补充：

- `publish` 首次发布创建 active 快照（version=1），后续调用生成 version+1 并把旧 active 置 superseded；事务内完成。
- `deletephoto`：照片被 active 快照引用时只从草稿移除并归档（`archivedAt`），不物理删除；公开页仍可读。
- `setcover`：`kind=photo` 必须属于该展览；`kind=render` 的 `renderKey` 必须是来自本展览 5.3 上传的规范裸 UUID（不接受文件路径）；`kind=auto` 清除显式封面。仅改封面不递增 `curationVersion`，仍更新 `updatedAt`；封面与 active 快照不同时 `hasUnpublishedChanges=true`，旧公开封面在更新发布前保持不变。
- `setphotolocation`（v1.7）：写入即作者确认（`status=confirmed`）；同一照片已有 `suggested` 且本次提交与其一致时保留原 `source`（exif/ai），作者改动后记 `manual`；前端不提交 `source`。`granularity=hidden` 时坐标可空（允许只标地名），`area`/`exact` 必须有坐标；只更新 `updatedAt`，不递增 `curationVersion`。
- `clearphotolocation`：删除该照片的位置记录（含 EXIF 建议），回到未知；照片存在但无位置记录时幂等成功。
- `searchplaces`：后端代理外部地点搜索，全应用 ≤1 次/秒、缓存重复查询、固定应用标识 UA、提供方地址可配置；只提交用户输入的地点名称，不携带坐标/照片/回忆/邀请令牌；“无结果”返回 200 + 空 `candidates`，外部服务失败才返回 503 `UPSTREAM_UNAVAILABLE`（不使用 `MODEL_FAILURE`）。任意已登录用户可调用，界面只在作者工作台。
- 共同投稿权限（v1.9）：创建者管理邀请/参与/审阅/采用/移除记忆；已授权投稿者只能上传/查看/更新/撤回自己的投稿；邀请令牌只作加入凭证，不能读私有图片或草稿；被撤销参与后不可重新加入（终态），仍可查看/撤回自己的投稿；创建者不可加入或投稿自己的展览（`CONTRIBUTION_SELF_NOT_ALLOWED`）；越权/私有资源统一 404。
- `listcontributions`（v1.10）：创建者传 `exhibitionId` 时必须是自己的展览，返回该展览 `submitted`/`declined`/`withdrawn`（不含 `draft`，含“未被采用”）；投稿者返回自己的 `draft/submitted/declined/withdrawn`，可传自己的展览过滤，不能传他人展览；无 `exhibitionId` 时按角色返回各自可访问范围。列表即详情，不另设投稿详情路由。
- 投稿上传（v1.10）：`POST /api/contributions/upload` 用于给已有回忆附加/替换唯一照片（`contributionId` + 单文件），或不带 `contributionId` 批量创建带照片的 `draft` 投稿（兼容 v1.9；每条投稿至多 1 张照片）。先鉴权与参与关系，再在写文件前拒绝 >10 张/批和照片配额超限（400），单文件大小/类型失败放 200 `failures[]`；替换只允许单文件；`draft`（含历史纯文字投稿）可先保存、后通过此接口附加照片再提交。`GET /api/contributions/{contributionId}/content` 仅对 `file` 非空的投稿提供字节（纯文字 404）。
- 配额（v1.12）：默认单文件 15 MiB、单批 10 张、每人每展览 20 张/256 MiB、每展览 60 张/768 MiB；照片配额只统计 `file` 非空的投稿（张数与字节）；历史纯文字投稿不占照片配额，但新提交路径必须有照片（纯文字仅兼容查看/撤回/拒绝/补图后重提）；容量计入原图、衍生图、未清理旧版本与并发预留；撤回不立即释放照片配额，文件清理后才释放；6 个 `CONTRIBUTION_*` 环境变量可覆盖（spec §6.2）。

### 2.3 示例：publish

```json
// 请求
{ "exhibitionId": "0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10" }
// 响应
{ "version": 2, "publishedAt": "2026-10-27T09:30:00Z" }
```

## 3. curation

### 3.1 对象

```text
SuggestThemesRequest(exhibitionId, hint: String?)          // hint ≤200 字
ThemeSuggestionsResponse(proposals: [ThemeProposal])
ThemeProposal(name, concept, groups: [ProposalGroup(title, photoIds: [UUID])])
RefineCurationRequest(exhibitionId, instruction)          // instruction ≤500 字
RefineCurationResponse(reply, proposal: CurationProposal)
CurationProposal(title, narrative, groups: [GroupInput])
GetChatHistoryRequest(exhibitionId)
ChatHistoryResponse(messages: [ChatMessageView(role: "user"|"assistant", content, createdAt)])
GetPhotoInsightsRequest(exhibitionId)
PhotoAnalysis(description, mood, palette: [String], memoryCues: [String], sensory, suggestedCaption)
PhotoAnalysisView(photoId, analysis: PhotoAnalysis, model, analyzedAt)
PhotoInsightsResponse(analyses: [PhotoAnalysisView], latestBrief: SceneBrief?)   // latestBrief 语义 = 当前采用场景（v1.14）的题面；未采用修订候选不参与对照
SuggestPhotoLocationRequest(photoId)
GetPhotoLocationCandidatesRequest(photoId)
ConfirmPhotoLocationCandidateRequest(photoId, candidateId, granularity: "hidden"|"area"|"exact")
PhotoLocationCandidateView(id, name, latitude: Double?, longitude: Double?,
                           granularity: "area"|"exact"?, reason)
PhotoLocationCandidatesResponse(photoId, candidates: [PhotoLocationCandidateView],
                                model: String?, generatedAt: Instant?)
```

### 3.2 路由

| 路由 | 类 | 认证 | 请求 → 响应 | 错误 |
|---|---|---|---|---|
| `suggestthemes` | `SuggestThemesMessage` | 令牌 | `SuggestThemesRequest` → `ThemeSuggestionsResponse` | BAD_REQUEST(`hint` 超 200 字或无照片), MODEL_FAILURE, NOT_FOUND |
| `refinecuration` | `RefineCurationMessage` | 令牌 | `RefineCurationRequest` → `RefineCurationResponse` | BAD_REQUEST(`instruction` 为空/超 500 字或无照片), MODEL_FAILURE, NOT_FOUND |
| `getchathistory` | `GetChatHistoryMessage` | 令牌 | `GetChatHistoryRequest` → `ChatHistoryResponse` | NOT_FOUND |
| `getphotoinsights` | `GetPhotoInsightsMessage` | 令牌 | `GetPhotoInsightsRequest` → `PhotoInsightsResponse` | NOT_FOUND（只读缓存，不触发模型调用） |
| `suggestphotolocation` | `SuggestPhotoLocationMessage` | 令牌（作者） | `SuggestPhotoLocationRequest(photoId)` → `PhotoLocationCandidatesResponse` | NOT_FOUND（照片不存在/非本人展览/已归档）；MODEL_FAILURE（AI/上游失败，或模型输出全部候选非法） |
| `getphotolocationcandidates` | `GetPhotoLocationCandidatesMessage` | 令牌（作者） | `GetPhotoLocationCandidatesRequest(photoId)` → `PhotoLocationCandidatesResponse` | NOT_FOUND（照片不存在/非本人展览/已归档）；候选为空返回空数组，不触发 AI |
| `confirmphotolocationcandidate` | `ConfirmPhotoLocationCandidateMessage` | 令牌（作者） | `ConfirmPhotoLocationCandidateRequest(photoId, candidateId, granularity)` → `PhotoLocationView` | NOT_FOUND（照片/候选不存在或候选已不在当前集合）；VALIDATION(`LOCATION_GRANULARITY_INVALID`/`LOCATION_COORDINATES_INVALID`：无坐标候选选择 area/exact)；不递增 curationVersion |

候选语义（v1.13）：

- 仅作者可请求识别/读取候选/确认；候选只存 `curation.photo_location_candidates`，不进入任何公开视图或发布快照；未确认候选不改变 `gallery.photo_locations`、不改变公开地图。
- `suggestphotolocation` 用**元数据已移除/重编码后的展示图**调用独立 `LocationModel`（提示词 `photo-location-v1`），AI 输入不携带 photoId、业务 ID、token、照片元数据或已确认私密位置；返回候选最多 5 条（模型要求最多 3，服务端截断至 5），无候选返回空数组。每次 suggest 在一个事务内替换该照片当前候选集，候选 ID 新生成、不复用；已确认 `photo_locations` 不受影响。
- 候选字段：`name` 1–120 码点；`reason` 1–200 码点；有坐标时 `latitude/longitude` 成对、有限、WGS84，`granularity ∈ area|exact`；无坐标时 `latitude/longitude` 与 `granularity` 均为 `null`（仅名称候选）。模型输出不可信，服务端逐条校验、丢弃非法候选并截断；至少一条合法即成功，全部非法返回 `MODEL_FAILURE`（不静默当成空结果）。
- `confirmphotolocationcandidate` 把候选的 name/坐标复制到 `gallery.photo_locations`：`source=ai`、`status=confirmed`、写入请求选择的 `granularity`；候选无坐标时只允许 `hidden`（仅名称），选择 `area/exact` 返回 400 `LOCATION_COORDINATES_INVALID`。候选必须属于该照片且仍在当前候选集（重跑替换后旧 candidateId 不可确认，404）。确认只刷新 `updatedAt`，不递增 `curationVersion`、不使场景过期；`hasUnpublishedChanges` 由既有公开位置投影计算。确认后候选保留，重跑 suggest 可替换候选，已确认位置不变。
- `getphotolocationcandidates` 只读当前候选集，不触发 AI；无候选返回 `candidates: []`、`model/generatedAt` 为 `null`（历史运行过则有值）。

## 4. scene

### 4.1 对象

```text
GenerateSceneRequest(exhibitionId, hint: String?)          // hint ≤80 字，可空
CancelSceneRequest(runId)
GetSceneRunRequest(exhibitionId)
ReviewSceneRequest(runId, captures: [String], runtime: RuntimeEvidence)
GetPublishedSceneRequest(exhibitionId)
ReviseSceneRequest(parentRunId, instruction)               // instruction 去首尾空白后 1–500 码点
AcceptSceneRunRequest(runId)
DismissSceneRunRequest(runId)

SceneRunView(runId, exhibitionId, status, source: "ai"|"fallback"?, attempts: Int,
             kind: "generate"|"revise"|"restore", parentRunId: UUID?, revisionInstruction: String?,
             hint: String?, photoIds: [UUID], curationVersion: Int,
             brief: SceneBrief?, code: String?, review: SceneReview?,
             errorCode: String?, errorMessage: String?, isCurrent: Bool, dismissed: Bool, createdAt, updatedAt)
SceneBrief(mood, memoryReading, scenePrompt, entranceNarration, palette: [String], avoid: [String], userHint: String?)
RuntimeEvidence(buildMs: Int, fps: Double, errors: [String],
                photoIdsUsed: [UUID], networkAttempts: Int)
SceneReview(scores: RubricScores, verdict: "pass"|"revise", issues: [String], summary)
RubricScores(moodMatch, photoPresence, composition, lightingColor, completeness)   // 1–5
ListSceneRunsRequest(exhibitionId)
GetSceneRunByIdRequest(runId)
RestoreSceneRunRequest(runId)
SceneRunSummary(runId, status, source?, attempts, kind, parentRunId?, revisionInstruction?, hint?, mood?, scores: RubricScores?, weightedScore: Double?,   // revisionInstruction v1.15
                reviewSummary?, errorMessage?, restoredFrom: UUID?, isCurrent, acceptable, matchesCurrentDraft, restorable, createdAt,
                dismissed)   // dismissed v1.19
SceneRunHistoryResponse(runs: [SceneRunSummary])          // 最新在前
PublishedSceneResponse(code, runtimeVersion, generatedAt)
```

`SceneRunView.status`：`queued | generating | awaiting_capture | reviewing | succeeded | failed | cancelled`。
`SceneReview.issues` ≤6 条；`summary` ≤200 字。`reviewscene` 请求体按 UTF-8 字节计允许 ≤12 MiB（12582912 bytes），超限返回 HTTP 400 `BAD_REQUEST`；四张截图各 ≤2 MiB，经 base64 编码后仍在总体上限内。

阶段语义（2026-10-30 起，**字段与 JSON 形状不变**）：`status=generating` 时 `brief` 可能已非空——父题面写完即先落库，代码还在生成；因此 generating + `brief=null` 表示正在写题面，generating + `brief≠null` + `attempts=0` 表示正在写场景代码，`attempts>0` 表示按上一轮评审修订代码。构建阶段崩溃后的独立修复不增加 `attempts`（运行视图不暴露构建修复计数），此时仍是 generating + `brief≠null` + `attempts=0`，前端不区分这段与「正在写场景代码」。前端据此显示真实子阶段，不自行猜测。

构建崩溃语义（2026-10-29 引入，2026-11-01 起使用独立额度，**字段与 JSON 形状不变**）：客户端沙箱里生成代码崩溃（编译失败 / `build(ctx)` 抛错 / 构建超时）时，以 `captures: []` + `runtime.errors` 非空回传 `reviewscene`；服务端判为硬门禁「构建阶段崩溃」（不再额外报截图数量与帧率），先消耗一次独立的构建修复额度（`scene_runs.build_repairs`，上限 1，不占 `SCENE_MAX_REVISIONS` 质量修订额度）；独立额度用尽后按普通门禁失败处理——有修订额度则进入修复，用尽则兜底。

生成失败语义（2026-11-01 起，**字段与 JSON 形状不变**）：题面或代码生成失败（含修复阶段）时运行直接置 `failed`（`errorCode=GENERATION_FAILED`，`errorMessage` 写明原因并提示重新生成），不再改用通用兜底题面；兜底场景只在评审/修复额度用尽时作为最终结果，此时保留的题面仍是 AI 按照片写的。

纯场景语义（2026-10-28 起，**字段与 JSON 形状不变**）：

- `RubricScores.photoPresence` = **照片情绪在场感**：场景需传达这组照片的情绪/记忆意象，**不要求照片实体出现在三维场景中**；照片由宿主在侧栏/大图展示。
- `reviewscene` 的 `runtime.photoIdsUsed` 仅记录宿主实际用于渲染的照片（纯场景下允许且通常为 `[]`），**不再要求覆盖 `run.photoIds`**；硬门禁不含“照片必须全部在场景中出现”。

设计感语义（v3，2026-10-28 引入；评审提示词 v3.3 起放宽；**字段与 JSON 形状不变**）：

- 评审视角：`reviewscene` 回传初始 + 90°/180°/270° 四张环绕截图；评审提示要求覆盖四个方位、不能只看初始视角，服务端硬门禁只校验四张截图的数量与合法性（合法 JPEG data URL、每张 ≤2 MiB）。
- 通过判定：加权分 ≥ `REVIEW_PASS_SCORE`（默认 3.0，可由环境变量调整；v0.9.9 由 3.3 放宽）、无单项 < 2、`moodMatch ≥ 3`、`photoPresence ≥ 3`、`lightingColor ≥ 3` 且 `composition ≥ 3`（v3 提高的光影/构图门槛）。
- 打分尺度与扣档制（v3.3）：3 分 = 画面完整、情绪能读出、可以展示，4 分 = 在此基础上主地标、光影或远近层次明显出色；设计感问题按「命中项只扣 1 档」处理，不再逐项把维度封顶。
- 扣档项：水面纯色无纹理 → `lightingColor`/`completeness` 各扣 1 档；“盒子+三棱柱”式建筑或主地标可辨认构件 <6 → `composition`/`completeness` 各扣 1 档；首屏上方或下方大片空带 → `composition` 扣 1 档；随机球体堆叠/随机粒子当主要装饰 → `composition`/`completeness` 各扣 1 档；（`scene-review-v3.1` 起）尖刺三角片树冠或外露支架状枝干 → `completeness` 扣 1 档，树/草等前景挡住主体门窗或主地标 → `composition` 扣 1 档。
- 封顶例外：仅整体近黑/无主光/死黑剪影仍封顶 `lightingColor ≤ 2`；黑屏、空场景、大量破面仍封顶 `completeness ≤ 1`。
- 四面成立检查（v3.3，只核对主地标）：主地标从某个方位看只有正面成立（背面/侧面没有墙体或围护、可直接穿过门洞看到室外、屋顶下面是空的或构件只在正面）→ `completeness`/`composition` 各扣 1 档，并在 issues 写出缺失方位；次要建筑与远景小物件只在 issues 提示、不扣分；门后有室内空间属于加分细节，缺失不扣分。
- 提示词版本与工件：当前父/子生成提示词为 `scene-parent-v3.5`（v3.5 起题面素材里带已采用的投稿讲述摘录，见 spec v0.15.0）、评审为 `scene-review-v3.3`、修复为 `scene-repair-v3.2`；可读参考片段按题面从 `backend/src/main/resources/scene/snippets/` 选择；兜底与 fake 模板仍为 `foggy-coast.js`。评分评审的 `summary` 根据服务端最终评分和阈值生成；硬门禁失败的摘要由门禁问题生成，两者均与最终 `verdict` 一致；历史记录不回填。上述不改变 API 字段。

阶段 4 场景修订语义（v1.14）：

- 运行种类：`scene_runs.kind ∈ generate|revise|restore` 表示运行起因，与 `source=ai|fallback` 表示产物来源相互独立；`parent_run_id` 仅用户修订指向直接父运行；`revision_instruction` 仅修订保存用户指令（与生成时 `hint` 分开）。`restored_from` 仍只表示恢复来源；`attempts`/`build_repairs` 仍是单次运行内自动修复计数，不代表用户修订轮次。旧行 `kind` 由独立一次性迁移 `BackfillLegacyFields`（`scripts/db/backfill-legacy-fields.ps1`）回填：`restored_from` 非空→`restore`，其余→`generate`；迁移重跑不得覆盖已写入的 `revise`，不挂常规启动。
- 当前采用场景指针：`gallery.exhibitions.current_scene_run_id` 可空，唯一决定“当前场景”。普通生成成功、恢复成功自动更新指针；修订成功只是候选，不切指针；失败/取消/未采用候选不改指针。指针写入统一经 gallery 公开 Table 方法，校验与写入在同一连接事务内。旧展览由独立一次性 JVM 迁移回填（不在常规启动流程），只填空指针、按原排序取最新成功运行，记录完成标记/摘要，可失败重跑；正式切换后不做运行期“空指针取最新成功”兜底。
- `SceneRunView.isCurrent` 只比较指针；`SceneRunSummary.isCurrent` 同样只比较指针，`acceptable` 由服务端判定采用资格（`kind=revise` + `succeeded` + 父运行仍为当前 + 照片集合/curationVersion/运行时仍匹配 + 非当前），`restorable`/`matchesCurrentDraft` 语义保持。`ExhibitionDetail.currentSceneRun` 读指针，`sceneRun` 是最新运行（用于进度/候选）；`sceneStale`、`scenePalette`（草稿）、`hasUnpublishedChanges`、发布校验均依据当前指针。
- 修订输入：指令去首尾空白后 1–500 Unicode 码点，允许中文、换行与常规标点；拒绝 NUL 等控制字符，但保留换行（U+000A）与制表符（U+0009）。独立提示词 `scene-revise-v1`：只修改点名元素与直接依赖，保留其他构图/材质/机位；用户指令、父代码与题面作为明确分隔的不可信数据，不改变系统约束，输出继续走代码校验/沙箱/评审。父代码不静默截断（上限沿用 1 MiB）；请求体序列化 UTF-8 ≤2 MiB（超限 400 `BAD_REQUEST`）；模型端口按上下文预算保守估算，无法容纳时 400 `SCENE_REVISION_TOO_LARGE`，不发送必超限请求、不改为从头生成。fake 提供确定性成功/评审修复/失败与保留父版本关联的样例。
- `revisescene`：校验作者、父运行属于同一展览且为当前采用场景、父运行 succeeded、照片集合与 curationVersion 仍匹配、运行时兼容、无其他活跃运行；任一不满足返回 409 `SCENE_REVISION_STALE`（父运行/素材/运行时过期）或 409 `SCENE_RUN_ACTIVE`（已有活跃运行）；指令非法 400 `SCENE_INSTRUCTION_INVALID`。创建 `kind=revise`、`parent_run_id=parentRunId`、`revision_instruction` 的新运行，复用现有异步 fiber/状态机/截图评审/取消/失败；不覆盖父运行代码与评审；同一展览最多一个活跃运行，冲突时不静默复用其他指令任务。
- `acceptscenerun`：校验作者、运行 succeeded、`kind=revise`、父运行仍为当前指针、照片集合/curationVersion/运行时仍匹配，事务内更新 `current_scene_run_id`；返回 `SceneRunView(isCurrent=true)`。非修订/未成功运行 409 `SCENE_RUN_NOT_ACCEPTABLE`；父版本或素材已过期 409 `SCENE_REVISION_STALE`；同一修订已是当前则幂等成功。采用只改草稿指针，公开页仍读 active 快照，需重新发布才变化。
- `dismissscenerun`：仅作者可放弃成功且未成为当前场景的修订运行，返回 `dismissed=true`；重复放弃幂等。已放弃的候选不再显示在工作台，也不能通过 `acceptscenerun` 直接采用，历史仍可查看并恢复为新运行。当前运行、非修订或未成功运行返回 409 `SCENE_RUN_NOT_ACCEPTABLE`，不存在或无权访问返回 404。
- 读取点迁移（v1.14）：`getexhibition` 当前场景按指针读取、最新运行另行返回；`listmyexhibitions` 的 `sceneStale`/`scenePalette`/未发布修改依据指针；`updatecuration` 返回详情同语义；`publish` 只冻结指针所指运行（指针空 → 400 `SCENE_NOT_READY`）；`getphotoinsights.latestBrief` 指当前采用场景题面；`listsceneruns` 的 `isCurrent` 只比较指针；`restorescenerun` 是否当前/幂等/恢复成功更新指针均依据指针；`hasUnpublishedChanges` 比较快照运行与当前指针；公开页/作者主页/公开配色继续读发布快照。

### 4.2 路由

| 路由 | 类 | 认证 | 请求 → 响应 | 错误 |
|---|---|---|---|---|
| `generatescene` | `GenerateSceneMessage` | 令牌 | `GenerateSceneRequest` → `SceneRunView` | VALIDATION(`PHOTO_COUNT`/`PHOTO_UNGROUPED`/`GROUP_EMPTY`), BAD_REQUEST(`hint` 超 80 字), NOT_FOUND |
| `getscenerun` | `GetSceneRunMessage` | 令牌 | `GetSceneRunRequest` → `SceneRunView` | NOT_FOUND |
| `cancelscene` | `CancelSceneMessage` | 令牌 | `CancelSceneRequest` → `SceneRunView` | NOT_FOUND, CONFLICT |
| `reviewscene` | `ReviewSceneMessage` | 令牌 | `ReviewSceneRequest` → `SceneRunView` | BAD_REQUEST(请求体超过 12 MiB), CONFLICT, NOT_FOUND |
| `getpublishedscene` | `GetPublishedSceneMessage` | 公开 | `GetPublishedSceneRequest` → `PublishedSceneResponse` | NOT_FOUND |
| `listsceneruns` | `ListSceneRunsMessage` | 令牌 | `ListSceneRunsRequest` → `SceneRunHistoryResponse` | NOT_FOUND |
| `getscenerunbyid` | `GetSceneRunByIdMessage` | 令牌 | `GetSceneRunByIdRequest` → `SceneRunView` | NOT_FOUND |
| `restorescenerun` | `RestoreSceneRunMessage` | 令牌 | `RestoreSceneRunRequest` → `SceneRunView` | NOT_FOUND, VALIDATION(`SCENE_RUN_NOT_RESTORABLE`), CONFLICT(`SCENE_RUN_ACTIVE`) |
| `revisescene` | `ReviseSceneMessage` | 令牌 | `ReviseSceneRequest(parentRunId, instruction)` → `SceneRunView`（kind=revise，候选） | NOT_FOUND, VALIDATION(`SCENE_INSTRUCTION_INVALID`/`SCENE_REVISION_TOO_LARGE`), CONFLICT(`SCENE_RUN_ACTIVE`/`SCENE_REVISION_STALE`), BAD_REQUEST(请求体超过 2 MiB) |
| `acceptscenerun` | `AcceptSceneRunMessage` | 令牌 | `AcceptSceneRunRequest(runId)` → `SceneRunView(isCurrent=true)` | NOT_FOUND, CONFLICT(`SCENE_RUN_NOT_ACCEPTABLE`/`SCENE_REVISION_STALE`) |
| `dismissscenerun` | `DismissSceneRunMessage` | 令牌 | `DismissSceneRunRequest(runId)` → `SceneRunView(dismissed=true)` | NOT_FOUND, CONFLICT(`SCENE_RUN_NOT_ACCEPTABLE`) |

语义补充：

- `generatescene`：同一展览已有未结束运行时返回现有运行（幂等）；`hint` 仅作为父智能体题面的参考，不改变策展。
- `cancelscene`：仅非终态可取消；取消后 `status=cancelled`，不发起后续评审/修复；终态取消返回 CONFLICT。
- `reviewscene`：仅 `awaiting_capture` 可回传，条件更新防重复；返回推进后的运行状态；`runtime.photoIdsUsed` 不要求覆盖 `run.photoIds`（纯场景下可为空，照片展示在宿主侧栏/大图，不属于 3D 场景）；通过判定自 v3 起额外要求 `lightingColor ≥ 3` 且 `composition ≥ 3`（见 §4.1 设计感语义）。
- `getpublishedscene`：读 active 快照绑定的 sceneRunId；无 active 快照或场景不可用返回 404。
- `listsceneruns`：该展览全部运行（含失败/取消），不含代码；`weightedScore` 与通过判定同源；`isCurrent` 表示它是发布会使用的「最新 succeeded」；`matchesCurrentDraft` 表示照片集合与策展版本仍与草稿一致；`restorable` = succeeded、有代码且 `runtimeVersion` 与当前运行时一致。
- `restorescenerun`：把旧的成功运行克隆为一条新的 succeeded 运行，`photoIds`/`curationVersion` 取当前草稿（因此恢复后可直接发布），`restoredFrom` 指向最初那次生成；已是当前版本时幂等返回同一运行；有进行中的运行时 409。非本人一律 404。恢复不改公开页：展览随之 `hasUnpublishedChanges=true`，重新发布后公开页才使用恢复的场景。

## 5. 非消息路由

### 5.1 照片上传

`POST /api/photos/upload`，`multipart/form-data`，需令牌。

| 字段 | 类型 | 说明 |
|---|---|---|
| `exhibitionId` | text | 展览 UUID |
| `files` | file × N | JPEG/PNG/静态 WebP，≤15MB/文件，≤30 张/展览总量 |

响应 `UploadPhotosResponse(photos: [PhotoView], failures: [UploadFailure(fileName, reason)])`；单文件失败不影响其他文件（reason 同 `UPLOAD_*`）。

动画 WebP 和无法解码的损坏文件返回单文件 `UPLOAD_UNSUPPORTED_TYPE`；透明图片生成白底 JPEG 缩略图，原图字节保留。

### 5.2 照片内容

`GET /api/photos/{photoId}/content?variant=thumb|full`

- 可见性：作者任意状态可读；非作者仅当照片被 active 快照引用（含归档照片）可读。
- `variant=thumb`：返回长边 480px 的白底 JPEG 缩略图（固定 `image/jpeg`），作者与公开读取相同。
- `variant=full`：作者读取私有原图（`Content-Type` 为存储 mime）；非作者/匿名读取去元数据展示副本（固定 `image/jpeg`，已按 EXIF Orientation 纠正方向并重编码去掉 EXIF/GPS/注释；PNG/WebP 原图也转码为 JPEG）。原始字节永不经公开路径返回。
- 展示副本缺失或不可读时返回 500 `INTERNAL`（不可用），不回退原图；作者私有读取不受影响。

### 5.3 场景渲染封面上传

`POST /api/exhibitions/{exhibitionId}/cover-render`，`multipart/form-data`，需令牌。

| 字段 | 类型 | 说明 |
|---|---|---|
| `file` | file | 前端截取的场景画面，JPEG/PNG，≤4MB，长边 ≤2048 |

响应 `CoverRenderUploadResponse(renderKey, width, height)`；`renderKey` 是服务端生成的规范裸 UUID，用于 `setcover`，不是存储路径。错误：`BAD_REQUEST`（multipart 无法解析或缺少 file）、`VALIDATION`（`COVER_TOO_LARGE` / `COVER_UNSUPPORTED_TYPE`）、`UNAUTHORIZED`、`NOT_FOUND`，以及通用 `INTERNAL`；遵循 §0 的统一错误结构。`INVALID_COVER` 属于后续 `setcover` 的校验错误。

### 5.4 封面图

`GET /api/exhibitions/{exhibitionId}/cover`

- 作者读当前草稿封面；公开访问读 active 快照封面。
- 公开的 auto/photo 封面解析为对应照片的去元数据展示副本（固定 `image/jpeg`）；render 封面在上传时已按 EXIF Orientation 纠正并整图重编码，JPEG/PNG 输出不再携带 EXIF/GPS/注释等元数据。
- 返回图片字节；公开封面字节缺失或不可读时返回 500 `INTERNAL`（不可用），不回退原始照片字节。
- 匿名访问尚无 active 快照的展览返回 401；其余不可用（展览或封面不存在、已登录非作者）统一 404。

### 5.5 投稿上传

`POST /api/contributions/upload`，`multipart/form-data`，需令牌（active 投稿者）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `exhibitionId` | text | 展览 UUID；上传者必须在 `exhibition_contributors` 中为 `active`，创建者不可投稿自己的展览 |
| `contributionId` | text? | 可选；给已有投稿附加/替换唯一照片时必填且只允许 1 个文件（draft 含历史纯文字也可附加） |
| `files` | file × N | JPEG/PNG/静态 WebP，≤15MB/文件；不带 `contributionId` 创建投稿时 1–10 个（每个文件一条带照片 draft），带 `contributionId` 时恰好 1 个 |

响应 `ContributionUploadResponse(contributions: [ContributionSummary], failures: [ContributionUploadFailure(fileName, reason)])`；创建返回 `status=draft`（file 非空），附加/替换保持原状态并 `version+1`（file 非空）。单文件失败（`UPLOAD_TOO_LARGE`/`UPLOAD_UNSUPPORTED_TYPE`）不影响其他文件；>10 张/批或照片配额超限在写文件前返回 400（`CONTRIBUTION_BATCH_LIMIT`/`CONTRIBUTION_QUOTA_PHOTOS`/`CONTRIBUTION_QUOTA_BYTES`）。上传先写临时文件，取得展览级 advisory lock 后在同一临界区完成照片配额检查与 `draft` 行插入/更新，数据库失败删除文件；替换成功后清理旧版本文件。

### 5.6 投稿私有图片

`GET /api/contributions/{contributionId}/content?variant=thumb|full`

- 可见性：仅投稿者本人与展览创建者；匿名 401、非本人/非创建者 404、已撤回投稿 404；邀请令牌不参与授权。纯文字投稿（`file=null`）没有图片内容，返回 404。
- `variant=thumb`：私有缩略图（固定 `image/jpeg`）；`variant=full`：私有原图（存储 mime）。
- 采用时服务端把投稿源复制为草稿照片的独立文件；投稿撤回按 v1.11.1 规则清理已采用讲述与由投稿新建且无其他讲述的草稿照片（被 active 快照引用则归档），已有照片目标只删除讲述，已发布快照不变。

### 5.7 其它

| 路由 | 说明 |
|---|---|
| `GET /api/health` | 数据库连通时 `{"status":"ok"}`；不可用时 503 `{"status":"error","reason":"DATABASE_UNAVAILABLE"}` |
| `GET /vendor/three.min.js` | 沙箱运行时 three.js UMD（固定版本） |

## 6. 契约样例与契约测试

共享样例放 `docs/contracts/`，是前后端的**唯一可执行期望值**。

- 命名：`docs/contracts/<service>/<routeName>.request.json` 与 `.response.json`；`service ∈ users|gallery|curation|scene`；无请求消息只写 response。
- 覆盖：52 条注册路由全覆盖；有请求的消息各一对样例，无请求消息只写 response；二进制路由覆盖对象样例。样例数 103（48 请求 / 55 响应），包含放弃修订候选的请求与响应。
- 样例规则：固定 UUID/时间/URL；不含密钥与真实用户数据；字段顺序无关，比较时按对象等价（忽略键顺序、浮点容差）。
- 后端 `ContractFixtureSpec`：response 样例 decode 必须成功 → encode 回 JSON → 与样例等价；request 样例 decode 成功。
- 前端 `contract.test.ts`：同一批样例经前端解码层（`parseXxx` / zod schema）不抛错；关键页面用样例渲染 smoke。
- 工作流：字段增删改先改样例与两侧类型，再改实现；`sbt test` 与 `pnpm test` 都必须通过才算契约未破坏。
- 沙箱消息协议（父页面 ↔ iframe）不在此契约内，见 `docs/specification.md` 第 9.4 节。
