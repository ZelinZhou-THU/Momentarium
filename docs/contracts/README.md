# 契约样例（contract fixtures）

`docs/contracts/` 保存前后端共享的 JSON 契约样例，是**可执行的契约基准**：后端 `ContractFixtureSpec` 与前端 `contract.test.ts` 都直接读取这里的文件。字段定义和错误语义以 [API 契约](../api-contract.md) 为准，样例与文档必须同步；二者冲突时需要修正，不能把其中一份的滞后视为正常。

## 命名与覆盖

- `docs/contracts/<service>/<routeName>.request.json` 与 `<routeName>.response.json`，`service ∈ users | gallery | curation | scene`。
- **无请求消息只写 response**（`getcurrentuser`、`logout`、`listmyexhibitions` 等），不要写空的 `{}` request 样例——避免与 `NoRequestMessage` 的解码约定混淆。
- 成功样例只放成功响应；错误结构（`error.code` / `details.reason`）定义在 `docs/api-contract.md` §0，由 E2E 冒烟与各服务错误用例覆盖，**不进成功 fixtures**。
- 二进制路由（照片上传/内容/封面）不写字节样例，只覆盖其对象响应（`UploadPhotosResponse`、`CoverRenderUploadResponse`、`CoverView`）。
- 可选字段（`Option`）至少在一个样例中以 `null` 出现；默认 `Option` 序列化为 `null` 且不省略字段。

## 通用格式约定

- 字段名 `camelCase`；ID 为 UUID 字符串；时间 ISO-8601 UTC（`2026-10-26T09:30:00Z`）；枚举为小写字符串。
- 固定 UUID / 时间 / URL；不含密钥与真实用户数据；密码使用占位值 `ExamplePassw0rd`。
- 字段顺序无契约意义；比较按对象等价（忽略键顺序、浮点容差）。
- 样例中的固定用户：`memory_curator`（id `a3f1c2d4-5e6b-4a7c-9d8e-1f2a3b4c5d6e`，创建时间 `2026-10-26T09:30:00Z`）。

## 覆盖状态

| service | 已覆盖路由 | 状态 |
|---|---|---|
| users | `register`、`login`、`getcurrentuser`（resp）、`logout`（resp）、`getmyprofile`（resp）、`updatemyprofile`、`changepassword` | 7 条路由（11 个 JSON；3 条无请求体）；账户设置 3 条 2026-10-31 加入 |
| gallery | 27 条消息路由全覆盖（2026-11-02 阶段 1 加 `setphotolocation`、`clearphotolocation`、`searchplaces`；契约 v1.7 起展览/公开视图样例含 `locations`，v1.8 起 `getauthorpage` 含 `journeyLocations`，v1.9 起共同投稿 11 条，v1.10 加回忆优先 2 条，v1.11 投稿加 `suggestedCaption`，v1.12 投稿必须带图/Adopt 去 targetPhotoId）：`createexhibition`、`listmyexhibitions`（resp）、`getexhibition`、`updateexhibitionmeta`、`updatecuration`、`deletephoto`、`deleteexhibition`、`publish`、`getpublishedexhibition`、`setcover`、`getauthorpage`、`setphotolocation`、`clearphotolocation`、`searchplaces`、`createcontributioninvite`、`getcontributionmanagement`、`closecontributioninvite`、`getcontributioninvite`、`joincontribution`、`revokecontributor`、`listcontributions`、`createcontribution`、`updatecontribution`、`declinecontribution`、`withdrawcontribution`、`adoptcontribution`、`removememory`；非消息对象样例 `upload.response.json`、`coverrenderupload.response.json`、`contributionupload.response.json`（历史纯文字投稿样例 `file: null`） | 阶段 1/1.5、阶段 2/2.5/2.6/2.7 完成；阶段 2.8 投稿必须带图样例已更新（文件数不变） |
| curation | `suggestthemes`、`refinecuration`、`getchathistory`、`getphotoinsights`（均 req+resp）；`suggestphotolocation`、`getphotolocationcandidates`、`confirmphotolocationcandidate`（2026-11-04 阶段 3 各 req+resp） | 7 条路由（14 个 JSON）；`getphotoinsights` 2026-10-31 加入；地点候选 2026-11-04 加入 |
| scene | 11 条消息路由全覆盖：`generatescene`、`getscenerun`、`cancelscene`、`reviewscene`、`getpublishedscene`、`listsceneruns`、`getscenerunbyid`、`restorescenerun`、`revisescene`、`acceptscenerun`、`dismissscenerun` | 22 个 JSON，前后端契约测试均已登记 |

当前状态（2026-11-05）：**103 份 JSON = 48 份请求 + 55 份响应**，覆盖 52 条注册消息路由及 3 个 multipart 上传响应。有请求的消息各有 request/response；4 条无请求消息只需 response。路由清单统一在 `docs/api-routes.json` 登记（users 7 + gallery 27 + curation 7 + scene 11），前后端测试对照该清单。

契约 v1.15（2026-11-04）只增字段、不增减文件：`listmyexhibitions`/`getexhibition`/`updatecuration` 响应加 `pendingContributionCount`，`adoptcontribution` 请求加 `groupId`，`listsceneruns` 响应加 `revisionInstruction`（并新增一条修订运行样例）。

契约 v1.16（2026-11-04）只增字段、不增减文件：`ContributionSummary` 增加 `exhibitionPublished`、`memoryPublished`，涉及 `listcontributions`、`createcontribution`、`updatecontribution`、`declinecontribution` 响应与 `contributionupload` 响应样例（`listcontributions` 同时覆盖“已随展览公开”“已发布但回忆未公开”的组合）。

契约 v1.17（2026-11-05）只增字段、不增减文件：`getcontributioninvite` 响应增加 `inviterName`。

契约 v1.19：`SceneRunSummary` 增加 `dismissed`（只更新 `listsceneruns` 响应，样例数量不变）。

契约 v1.18：新增 `dismissscenerun` 请求和响应，共 103 份样例、52 条消息路由；`SceneRunView` 增加 `dismissed`。

验证边界：后端对响应做解码、重新编码及 JSON 等价比较，对请求做解码；前端对响应做实际解码及格式校验。手写路由清单和成功样例不能独自证明所有实际 HTTP 请求、失败分支或可选字段组合均一致，需配合源码核对、错误/上传集成测试与 fake HTTP 冒烟。

纯场景语义（2026-10-28 起，**契约样例 JSON 形状不变**）：`RubricScores.photoPresence` = 照片情绪在场感（场景表达这组照片的情绪/记忆，不要求照片实体出现在三维场景中；照片在宿主侧栏/大图展示）；`reviewscene` 的 `runtime.photoIdsUsed` 只记录实际用于渲染的照片，纯场景下允许且通常为 `[]`，**不再要求覆盖 `run.photoIds`**。详见 [API 契约](../api-contract.md) §4 与 [场景提示词规范](../scene-prompt-spec.md)。

## 变更工作流

1. 先改本目录样例（新增/修改字段、可空性、枚举值）。
2. 同一次修改中更新 `docs/api-contract.md`、后端 `objects/` 类型与前端 TS 类型。
3. 跑 `sbt test`（`ContractFixtureSpec`）与 `pnpm test`（`contract.test.ts`），两者都绿才算契约未破；不允许"只改一侧 + 手测通过"。
