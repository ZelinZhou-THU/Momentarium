> 当前产品评审已采用四视角：初始相机与绕 orbit target 偏移 90°/180°/270°；下文原型双视角测量保留为历史证据。初始视角不保证是建筑正面。

# prototypes/three — 三维沙箱原型（D1 / task-4）

本目录是**独立于 React 与 Vite** 的一次性技术原型，用来在写任何前端代码之前验证 Momentarium 三维场景链路里风险最高的部分：固定版 three 的内联、CSP、照片纹理跨源污染、`canvas.toDataURL` 截图、iframe 沙箱与父页面消息协议、8s build 超时、90s 会话上限。

结论（2026-10-27，Edge 155 / Chromium，headless GPU）：

| 风险项 | 结论 | 证据 |
|---|---|---|
| CSP 内联 three + SceneRuntime | **可行**。`srcdoc` 内 `<meta>` CSP 生效，three 0.152.2 UMD 直接内联无 `</script>` 冲突 | normal 场景 `srcdoc 665,787 B`，`built` 正常返回 |
| ArrayBuffer → Blob URL → THREE.TextureLoader | **可行**，纹理可正常渲染 | 3 张照片全部加载，`textureLoadMs≈9ms` |
| `canvas.toDataURL` 跨源污染 | **不污染**。沙箱内 Blob URL 与其文档同源，截图成功 | 2 张 JPEG 均 1125×703、≈37–41KB，无 `CAPTURE_TAINTED` |
| 8s build 超时 | **可执行**。父页面 8s watchdog 在 sandbox 阻塞 12s 时照常触发（≈8.4s） | build-timeout 场景 `BUILD_TIMEOUT`，父页面全程可响应 |
| 单会话 ≤90s | **可执行**。90s 后 iframe 被销毁 | session-limit 场景 `iframeCount=0`、`sessionExpired=true` |
| WebGL 不可用 | **可提示**。`WEBGL_UNAVAILABLE` 错误码回传父页面 | webgl-unavailable 场景通过 |
| 生成代码联网 | **被 CSP 阻断且可检测**。`networkAttempts` 计数 ≥1 | network-guard 场景 3 次尝试（fetch+XHR 级 1 + CSP 违规 2） |
| `file://` 直接打开 | **不可用**，必须走本地静态服务 | 父页面 fetch 被拒绝 → `RESOURCE_LOAD_FAILED: Failed to fetch` |
| 性能 | 本机 headless GPU 下 32–47fps（1125×703，3 张照片）；≥20fps 硬门禁可满足 | 见 `evidence/report.json` |

> 结论一句话：**CSP/纹理/截图三件事全部成立，且沙箱 iframe 在 Chromium 下是进程隔离的，因此父页面 watchdog 能强制 8s/90s 上限**；D4 可以按 spec §9.3/§9.4/§9.7 直接落地，唯一硬限制是原型页面必须经 http 静态服务打开（生产有 Vite/后端托管，不构成问题）。

---

## 1. 目录与文件

```
prototypes/three/
  index.html                 父页面（极简 dev harness，非产品 UI；产品前端只用 Tailwind）
  app.js                     父页面控制器：资源加载、展示图降采样、srcdoc 组装、消息协议、watchdog、UI
  runtime.js                 SceneRuntime（沙箱内执行）：renderer/scene/camera、纹理、ctx、Orbit、截图、统计
  scene-code.js              手写示例场景 `function build(ctx)`（3 张照片的“海岸记忆龛”）
  scenarios/                 硬门禁边界用例（错误/超时/联网），由 probe 驱动
    build-error.js
    build-timeout.js          故意阻塞 12s，验证父页面 8s watchdog
    network-guard.js          故意 fetch + 外链图片，验证 CSP 与 networkAttempts
  vendor/three.min.js        固定 three@0.152.2 UMD 构建（来源与 sha256 见 §11）
  assets/synthetic-coast.jpg 合成海岸插图（长边 1024）
  serve.mjs                  零依赖 Node 静态服务器（只需 http:// 访问本目录）
  probe.mjs                  零依赖 CDP 探针：起服务、跑 headless Edge、跑全部场景、写 evidence/
  evidence/                  实测产物（截图、runtime 统计、report.json；可随时重跑覆盖）
```

产品代码（D4 之后）在 `frontend/src/scene/`，本目录不参与 `pnpm build`。

## 2. 快速开始

```powershell
# 1) 起静态服务（零依赖，Node 24 内置 http）
node prototypes/three/serve.mjs 4317
#    浏览器打开 http://127.0.0.1:4317/index.html，点“运行原型”

# 2) 一键实测（headless Edge，自动跑全部场景并覆盖 evidence/）
node prototypes/three/probe.mjs

# 3) 只跑某个场景
node prototypes/three/probe.mjs --scenario normal
#    可选：normal | build-error | network-guard | build-timeout | webgl-unavailable | file-protocol | session-limit
```

`file://.../index.html` 直接打开**不可用**（见 §10）。probe 需要本机安装 Microsoft Edge（`EDGE_PATH` 可覆盖路径）；不需要 `pnpm install`、不访问外网（three 已在 `vendor/` 内）。

## 3. 数据流

```
父页面 app.js
  1. fetch vendor/three.min.js + runtime.js + scene-code.js（同源 http，仅父页面；不放进 iframe）
  2. fetch assets/synthetic-coast.jpg → createImageBitmap → canvas 长边 ≤2048 → toBlob(JPEG 0.82)
     └─ 2400×1600 799,786 B → 2048×1365 522,180 B（scale 0.853）
  3. 拼 srcdoc = CSP meta + 内联 three + 内联 runtime（≈665 KB 字符串）
  4. 建 <iframe sandbox="allow-scripts" srcdoc=…>，等 load
  5. postMessage init(photos[], code)（ArrayBuffer 以 transfer 传递）
沙箱 iframe（不透明源，无网络）
  6. runtime.js：Blob(ArrayBuffer) → URL.createObjectURL → THREE.TextureLoader.loadAsync
     texture.colorSpace = SRGBColorSpace；加载后 revokeObjectURL
  7. new Function(code + ';return build')()，把 ctx 注入执行 build(ctx)（CSP 'unsafe-eval' 允许）
  8. 首帧渲染 → 回 built；收到 capture(views) → 等待 30 帧 fps 采样 → 逐视角 render + toDataURL(JPEG 0.82)
     → 回 captures(images[], runtime)
父页面
  9. 校验 event.source === iframe.contentWindow、消息结构、runId → 展示截图与统计
 10. 8s build watchdog / 90s 会话上限 → 销毁 iframe
```

## 4. 消息协议（父页面 ↔ iframe）

两端都校验 `event.source` 与消息结构；父页面额外校验 `runId` 防跨会话串扰。

```js
// parent -> iframe
{ type: 'init', runId, runtimeVersion: 1,
  photos: [{ id, width, height, aspect, mimeType, buffer: ArrayBuffer }],
  code: string,
  limits: { buildTimeoutMs: 8000, sessionLimitMs: 90000 } }
{ type: 'capture', runId, requestId, views: [{ azimuthDeg, elevationDeg }] }

// iframe -> parent
{ type: 'built', runId, runtimeVersion, buildMs, texturesMs, firstFrameMs, photoCount }
{ type: 'error', runId, code, phase, message, errors: [{ phase, name, message, stack, atMs }] }
{ type: 'captures', runId, requestId, runtimeVersion,
  images: [{ view, index, dataUrl, width, height }],
  runtime: { runtimeVersion, buildMs, texturesMs, firstFrameMs, fps, errors, photoIdsUsed,
             photoCount, networkAttempts, networkAttemptDetails, cspViolations, framesRendered,
             canvas, drawStats, webgl, orbitControls, sessionElapsedMs } }
{ type: 'photoselected', runId, photoId }
{ type: 'escape', runId }
```

要点：

- `postMessage` 两个方向都用 `targetOrigin='*'`：iface 是不透明源（`event.origin === 'null'`），无法定向；父页面用 `event.source === iframe.contentWindow` 做身份校验（这是唯一可靠的同源判据），`origin` 仅记录不依赖。
- ArrayBuffer 通过 transfer list 传递（零拷贝）；`init` 里已经 transfer 的 buffer 在父页面侧 `byteLength` 变 0（原型里在 post 之前记录大小）。
- 生成的 `code` 走 postMessage 而不是拼进 srcdoc：既不触发 HTML 解析/`</script>` 注入问题，也让 srcdoc 可在同一会话内复用。
- 截图视角语义：`azimuthDeg=0/elevationDeg=0` 表示**完全保留 build 后的相机**（初始视角）；其余视角按“围绕 orbit target 的方位角/仰角偏移”计算，当前产品后三张分别 = 方位角 +90°/+180°/+270°（旧原型第二张为 +35°）。若生成代码没调用 `ctx.addOrbitControls`，runtime 以 `[0,1.4,0]` 为兜底 target。
- 新增 `photoselected`：点击命中照片后回传 `photoId`，供预览页弹大图与图注（对应 spec §9.7）。
- 新增 `escape`：焦点在沙箱 iframe 内按 Esc 时由 runtime 转发给父页面（跨源 iframe 的按键不会冒泡到父页面），供沉浸观看退出等宿主 UI 使用（UI-05）；纯 UI 通知，不涉及 ctx/评审证据契约，不递增 runtimeVersion。

## 5. CSP 注意点（写 D4 的 `sandbox.tsx` 前必读）

srcdoc 内的 CSP（与 spec §9.4 完全一致）：

```text
default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none';
```

- `<meta http-equiv="Content-Security-Policy">` 必须出现在任何 `<script>` 之前，否则前几个内联脚本不受约束。
- `script-src 'unsafe-inline'`：内联 three + runtime 必需。`script-src 'unsafe-eval'`：runtime 用 `new Function` 编译生成代码所需。若 D4 改成把生成代码作为独立内联 `<script>` 写进 srcdoc，可去掉 `'unsafe-eval'`，但需要在写入前转义 `</script`；本原型按任务协议 `init(photos, code)` 用 `new Function`，保留 `'unsafe-eval'`。
- `img-src blob: data:`：`TextureLoader` 走 `<img>`，Blob URL 必须放行；`data:` 是“若被污染时的降级方案”（本机未用到）。若以后加缩略图/贴图，注意别把 `blob:` 误删。
- `connect-src 'none'`：fetch/XHR/WebSocket/EventSource 全部被拦，`networkAttempts` 才能作为硬门禁。原型对 `fetch`/`XHR.open`/`WebSocket`/`EventSource`/`sendBeacon` 打了计数补丁，并监听 `securitypolicyviolation` 兜住 `new Image()` 这类不走 JS 包装器的请求。**注意 `networkAttempts` 是上界**：同一 fetch 会同时被 JS 包装器与 CSP 违规各记一次（network-guard 场景实测 3 次 = fetch 1 + CSP 2），门禁是 `== 0`，不影响判定。
- `style-src 'unsafe-inline'`：runtime 用 `canvas.style.*` 撑满 iframe，且 srcdoc 里有一段 `html,body{margin:0;…}`——这是沙箱运行时产物，不属于产品自定义 CSS。
- `default-src 'none'` 会顺带拦 favicon 等；不要把它当错误回传（原型只把 CSP 违规计入 `cspViolations`，不进 `errors`）。
- 内联 three 前已验证 `vendor/three.min.js` 0.152.2 **不含** `<script`、`</script`、`<!--`、`-->`、`eval(`、`new Function`（扫描见 §11），因此直接内联安全；若后续升级 three 版本，必须重跑该扫描。
- three UMD 在 r150+ 会在加载时 `console.warn` 一句「build/three.min.js deprecated」。它只是 warning；runtime 的 `errors` 只收 `error`/未捕获异常，不会误判。**实测 headless 下 OOPIF iframe 的 console 事件不会转发到页面级 CDP target**，所以调试沙箱内错误要靠 runtime 自己回传，不要依赖 devtools console。

## 6. 跨源 / 纹理 / 截图可行性

- **为什么不污染**：父页面把 JPEG 字节（不是 URL、不是图片元素）交给 iframe；iframe 在自己的不透明源里 `new Blob([buffer])` + `URL.createObjectURL`，该 Blob URL 的源就是 iframe 文档自身，`<img>` 解码 → `drawImage` → `toDataURL` 全程同源，canvas 不会被标记为 tainted。实测两张截图均成功，无 `SecurityError`。
- **降级链路**：如果未来改传 data URL `<img>`（`img-src data:` 已放行），同样不污染；runtime 已把 `toDataURL` 的 `SecurityError` 映射为 `CAPTURE_TAINTED`，便于和“截图 2 张合法 JPEG”硬门禁对接。
- **必须 `preserveDrawingBuffer: true`**：截图发生在 rAF 渲染之后，不保留绘制缓冲时 `toDataURL` 可能拿到空帧（黑图）。原型 renderer 固定该选项。
- 纹理参数：`texture.colorSpace = THREE.SRGBColorSpace`、`anisotropy = min(8, maxAnisotropy)`；renderer 用 `outputColorSpace = SRGBColorSpace` + `ACESFilmicToneMapping`，与 spec §9.4 一致。
- 截图：`renderer.render(scene, camera)` 后立即 `canvas.toDataURL('image/jpeg', 0.82)`；实测 1125×703 / 37–41KB（上限是 ≤1600px、≤2MB，余量充足）。截图后恢复相机姿态再继续动画，不影响用户浏览。
- 视角控制：首屏截图就是 build 后的相机；第二张绕 orbit target 转 35° 方位角，因此生成代码**应显式给出 orbit target**（见 §8），否则兜底 target 可能不是主体中心。

## 7. 沙箱安全边界

- `<iframe sandbox="allow-scripts" srcdoc=…>`：**不给** `allow-same-origin` / `allow-popups` / `allow-forms` / `allow-top-navigation`；iframe 文档为不透明源，读不到应用 cookie/localStorage，也拿不到父页面 DOM。
- 生成代码只在 iframe 内、经 CSP 允许的 `new Function` 执行；父页面只收到结构化消息（id、dataURL、统计数据），**代码字节从不进入 React 应用上下文、数据库或命令路径**（DR-16）。
- 父页面按 spec §9.4 校验 `event.source` 与消息结构（类型、字段、runId、dataURL 前缀）；未知类型忽略并记日志。
- 截图与 runtime 证据是“客户端自证”，只用于 AI 评审与质量判断，不作为授权/安全判据（spec §9.4 信任模型）。

## 8. 超时与生命周期（实测）

| 限制 | 实现 | 实测 |
|---|---|---|
| build 8s | 父页面 `awaitMessage(['built'], 8000)` watchdog；iframe 侧 build 是同步执行，无法自中断 | build-timeout 场景（build 阻塞 12s）：父页面在 **8.4s** 报 `BUILD_TIMEOUT`，父页面全程可操作（freeze 观测 0 次） |
| 单会话 ≤90s | 父页面 90s 定时器；触发即销毁 iframe | session-limit 场景：`iframeCount=0`、`sessionExpired=true`、phase=session-ended |
| 截图超时 | 父页面 15s（原型值；spec 未规定） | 正常路径 `captureMs` 0.55–0.78s |
| 首屏/load 超时 | iframe load 10s | 正常 40–50ms |
| 会话结束 | `frame.srcdoc=''` + `remove()` | 成功路径原型保留 iframe 供手动交互，90s 后自动销毁（生产可在 capture 完成即销毁） |

**重要观察**：build-timeout 场景里 sandbox 阻塞 12s，父页面 watchdog 仍在 8.4s 触发 → Chromium（Edge 155）把 `sandbox="allow-scripts"` 的 srcdoc iframe 放进了**独立渲染进程（OOPIF）**，阻塞不会冻结父页面。这是 8s 超时能强制的前提；但它是浏览器实现细节，D4 上线前应在目标机器（Chrome/Edge）复测一次，并保留“父页面侧计时 + 销毁 iframe”的实现。若某浏览器把 srcdoc iframe 放回同一渲染线程，同步死循环会连父页面一起冻结——watchdog 只能事后补刀，唯一可靠兜底是生成代码侧约束（提示词禁止死循环）+ 会话级卡死时整页重载。

## 9. 性能（headless 实测，供 D4 参考）

- 本机 Edge 155 headless（`--headless=new`，ANGLE/Intel Arc B390 D3D11）：1125×703、3 张照片、7 个 draw call、128 三角形 + 240 粒子 → **32–47fps**（fps 按 30 帧窗采样；首帧含纹理上传/着色器编译不计入窗口）。
- 首帧 `firstFrameMs≈200–260ms`（含 three 解析、纹理上传、首帧渲染）；`buildMs` 2–4ms（纯 build 执行）。
- 见过一次 32fps 的波动来自 headless 合成器/测量窗口，不代表真实浏览器上限；D4 需要：`renderer.setPixelRatio(min(devicePixelRatio, 2))`、目标 60fps/最低 20fps、fps 必须按 30 帧平均（runtime 已内置“等够 30 帧再截图”）。

## 10. `file://` 与 `http://` 的差异（实测）

| 打开方式 | 结果 |
|---|---|
| `http://127.0.0.1:4317/index.html`（`node serve.mjs`） | 全链路正常：3 张照片、2 张截图、runtime 统计齐全 |
| `file:///…/prototypes/three/index.html?auto=1` | 页面本身能加载（app.js 是普通外链脚本），但 `fetch('vendor/three.min.js')`/照片被浏览器拒绝：`RESOURCE_LOAD_FAILED: Failed to fetch`，不会创建 iframe |

原因：CSP 方案要求 three 源码**内联**进 srcdoc，而父页面必须先读到 `vendor/three.min.js` 文本；`file://` 页面的是不透明源，Chromium 禁止 `fetch()` 读本地兄弟文件（XHR 同样不行）。改传 base64 预置文本可绕开，但会让仓库多一份 633KB 的重复 three，不值得。**结论：原型与产品统一走 http（本次用 `serve.mjs`，生产用 Vite/后端静态托管）**；`--allow-file-access-from-files` 属不安全启动参数，不作为方案。

## 11. 资源来源与校验

| 资源 | 来源 | sha256 | 大小 |
|---|---|---|---|
| `vendor/three.min.js` | `https://registry.npmjs.org/three/-/three-0.152.2.tgz` 的 `package/build/three.min.js`（npm registry 官方 tarball） | `218b9f9420af1ee2b773fa066cee0eeb52f7ac76ca2fa11b11b732c1ba0a6e39` | 633,338 B |
| npm tarball 本体 | 同上 | `7318789411e4c99e6cc864a98f6113182384cec8e029464ba6d24568c7681a69` | 6,090,069 B |
| `assets/synthetic-coast.jpg` | Pillow 生成的虚构海岸插图，见 [素材说明](../../tests/fixtures/README.md) | — | — |

- three 版本必须**固定 0.152.2**（spec §9.4）；`build/three.min.js` 是 UMD 构建，暴露全局 `THREE`，不引前端依赖、不进 `node_modules`。
- 已扫描该构建：`<script` / `</script` / `<!--` / `-->` 出现次数均为 0，`eval(`、`new Function` 均为 0（可直接内联 srcdoc）。
- 照片资产只用于原型；D4 场景测试使用 `tests/fixtures/jeju/`（由 fixture 任务产出）。

## 12. ctx 契约落地建议（D2 → `frontend/src/scene/contract.ts`）

原型按 spec §9.3 注入了 `runtimeVersion = 1` 的 ctx：

```js
ctx.THREE / ctx.scene / ctx.camera / ctx.renderer
ctx.photos: [{ id, width, height, aspect, texture }]
ctx.addOrbitControls(opts) / ctx.onFrame(fn) / ctx.setBackground(color)
```

建议 D4 保持 v1 不变，并把这几点写进子智能体提示词（`scene-prompt-spec §3.2`）与 `contract.ts` 常量化：

1. **照片点击约定**：生成代码给承载照片的 mesh 设 `mesh.userData.photoId = photo.id`。runtime 的射线拾取先沿父链找 `userData.photoId`/`userData.photoIds`，找不到再用 `material.map` 纹理对象反查 photoId（两条都已在原型验证）。不建议为此新增 `ctx.registerPhotoMesh`，会扩大生成代码出错面。
2. **orbit target 必须显式给**：`ctx.addOrbitControls({ target: [x,y,z], minDistance, maxDistance })`。当前四张评审截图的后三张绕该 target 转 90°/180°/270°；不调用则 runtime 兜底 target `[0,1.4,0]`，可能把主体转出画面。
3. **照片使用检测是启发式**：`photoIdsUsed` 由 scene 遍历 `material.map/emissiveMap/alphaMap`、`ShaderMaterial.uniforms` 里的 texture、以及 `userData.photoId(s)` 得到。D4 若允许自定义 ShaderMaterial 且纹理只进 uniform，请保留 uniform 扫描；若要更硬的判据，可在 v2 增加 `ctx.markPhotoUsed(id)`，但要同步改提示词与后端门禁文档。
4. **fps 采样**：`capture()` 先等满 30 帧（最多 4s）再截图，`fps = (n-1)*1000 / 时间窗`；低于 20fps 仍返回截图+低 fps，交给服务端硬门禁判失败（不要由客户端抛错）。
5. **截图视角**：当前产品 `views=[{azimuthDeg:0},{azimuthDeg:90},{azimuthDeg:180},{azimuthDeg:270}]`；view 0 保持 build 相机，其余绕 orbit target 转，与当前 spec §9.4 一致。
6. **CSP 字符串单一来源**：原型的 `SANDBOX_CSP` 是常量，D4 放 `contract.ts`，`sandbox.tsx` 与测试共用，避免漂移。
7. **完成即销毁**：生产上 `capture` 成功后即可销毁 iframe（原型为了手动点照片保留到 90s）；销毁必须 `srcdoc=''` + `remove()`，并清掉所有定时器。
8. **生成代码执行方式**：任务协议是 `init(photos, code)` + 沙箱内 `new Function`（需要 CSP `'unsafe-eval'`）；若 D4 倾向 §9.7 的“把 code 拼进 srcdoc”，则必须转义 `</script` 并在契约文档里改协议。两者安全边界相同（都在沙箱内），二选一即可，不要混用。
9. **照片链路**：父页面读原图 → canvas 降采样长边 ≤2048/JPEG 0.82 → 只传展示图字节；原图只用于大图查看，不进沙箱（spec §9.4）。
10. **渲染器参数**：`antialias: true`、`preserveDrawingBuffer: true`、`outputColorSpace = SRGBColorSpace`、`ACESFilmicToneMapping`；纹理 `colorSpace = SRGBColorSpace`；否则截图偏灰/过曝。截图宽度上限 1600px，由容器尺寸决定。

## 13. 已知问题 / 风险

1. **OOPIF 是浏览器实现行为**：8s/90s 能强制依赖“沙箱 iframe 与父页面不共享渲染线程”。本机 Edge 155 已确认；D4 要在目标浏览器复测，并保留提示词层面的死循环约束。
2. **fps 门禁受机器与场景复杂度影响**：原型简单场景 32–47fps；生成的复杂场景可能 <20fps。建议 D4 在验收时按 30 帧采样、并考虑 `pixelRatio ≤1.5` 与粒子/发光上限（提示词已约束）。
3. **`networkAttempts` 是上界**（同一请求可能被 JS 包装器与 CSP 各计一次）；门禁 `==0` 不受影响，但不能当“真实请求数”报表。
4. **`photoIdsUsed` 启发式**：通过 `material.uniforms` 已覆盖常见 shader 用法；若生成代码把纹理塞进自定义 `onBeforeCompile`/renderTarget，可能漏检。提示词要求 `userData.photoId` 并保留兜底。
5. **生成代码 console 不落父页面 devtools**（OOPIF），排查只能靠 `runtime.errors`；D4 可在 `sandbox.tsx` 里加 Target auto-attach 或接受现状。
6. **`file://` 不可用**（设计如此，见 §10）。
7. **srcdoc ≈650KB/会话**：字符串创建有成本；生产应缓存 three 文本并在每次会话复用（原型 `state.resources` 已缓存，rerun 仍复用）。
8. **three UMD 在 r160 被移除**：必须锁 0.152.2；若未来升级需改 ESM + blob URL/import map 方案，不在 MVP 范围。
9. **简化 Orbit 控制**不支持平移/阻尼，仅为兜底交互与截图；生成代码若自己实现相机，runtime 不覆盖其行为（截图仍按相机当前位置 + orbit target 计算）。
10. **headless 截图分辨率**：页面实际视口 1566×1103，stage 16:10 → 截图 1125×703；生产要按容器尺寸并限制宽度 ≤1600。

## 14. D4 文件映射建议（`frontend/src/scene/`）

| 原型 | 生产文件 | 说明 |
|---|---|---|
| `runtime.js` | `runtime.ts` | 沙箱内脚本：TS 写源码，导出 `RUNTIME_SOURCE` 字符串或独立构建产物；保持 runtimeVersion=1 |
| `app.js` 消息/生命周期部分 | `sandbox.tsx` | `SceneSandbox` 组件：srcdoc 组装、iframe 生命周期、postMessage、watchdog、销毁 |
| `app.js` 截图/运行证据部分 | `capture.ts` | `capture(views)` 请求封装、dataURL 校验、runtime 证据归一化 |
| `SANDBOX_CSP`、`RUNTIME_VERSION`、消息类型 | `contract.ts` | 单一来源常量 + 消息类型（无 `any`、无 `as` 强转，用判别联合） |
| `scene-code.js` | 仅作 fixture/示例 | 真实场景代码由模型生成 |

### 14.1 D2 移植状态（2026-10-27 已落地并复验）

`frontend/src/scene/` 已按上表落地 `contract.ts` / `runtime.ts` / `sandbox.tsx` / `capture.ts`（+ 两个 vitest）。
其中 `runtime.ts` 采用“自包含 typed function → `Function.prototype.toString()` → `RUNTIME_SOURCE`”方案：
沙箱内逻辑仍由 TypeScript 严格检查（three 只声明运行时用到的类型面，类型在 `toString` 时擦除），
构建期不需要额外生成 JS 文件；`contract.test.ts` 断言 `RUNTIME_SOURCE` 可编译、错误码与 `RUNTIME_VERSION` 同步。

D2 复验（一次性 headless Edge 脚本，用 tsc 转译 `runtime.ts` 后按本 README 的 srcdoc/CSP 跑真实 iframe）：

- `runtime-loaded` 96ms → `built` 218ms → `captures` 731ms；
- `buildMs=0.7`、`texturesMs=5.5`、`firstFrameMs=120.7`、`fps=54.6`、`errors=[]`、`photoIdsUsed=1/1`、`networkAttempts=0`；
- 2 张 1125×703 JPEG（28.7KB / 25.4KB），`orbitControls=true`，WebGL 2.0 / ANGLE Intel Arc；
- 证据：`evidence/d2-check-initial.jpg`、`evidence/d2-check-view-1.jpg`、`evidence/d2-check-page.png`。

## 15. 任务证据（task-4 验收对照）

| 要求 | 证据 |
|---|---|
| 固定 three@0.152.2 UMD | `vendor/three.min.js`，来源+sha256 见 §11 |
| 独立原型（无 Vite/React） | `index.html` + `app.js` + `runtime.js` + `serve.mjs`，零依赖 |
| `sandbox="allow-scripts"` + srcdoc + CSP | `app.js:buildSrcdoc`；`report.json` 各场景 `sandbox.csp` |
| postMessage 协议 + source/结构校验 | `app.js:handleSandboxMessage`、`runtime.js` message listener；`report.json` protocol 轨迹 |
| 照片 ArrayBuffer→Blob→Texture | `report.json` normal：`init photos=3 buffers=1.49MB`，`photoIdsUsed=3/3` |
| canvas 未被跨源污染 | 2 张 JPEG 截图成功（`capture-initial.jpg`/`capture-azimuth35.jpg`，1125×703，ffd8ff 头） |
| build(ctx) 用全部照片、可辨认、首屏相机 | `capture-initial.jpg`；`photoIdsUsed=3/3` |
| 内建简化 Orbit + 2 视角 | `runtime.js:createOrbitControls`；`capture-azimuth35.jpg` |
| buildMs/fps/errors/photoIdsUsed/networkAttempts | `evidence/runtime-normal.json`；normal：`buildMs≈2–4ms`、`fps 32–47`、`errors=[]`、`networkAttempts=0` |
| build 超时 8s | build-timeout 场景：`BUILD_TIMEOUT` @8.4s |
| 会话 ≤90s | session-limit 场景：90s 后 `iframeCount=0` |
| WebGL 不可用提示 | webgl-unavailable 场景：`WEBGL_UNAVAILABLE` |
| file:// 与 http:// 差异 | file-protocol 场景：`RESOURCE_LOAD_FAILED: Failed to fetch`；§10 |

复跑命令：`node prototypes/three/probe.mjs`（会覆盖 `evidence/`，全绿时退出码 0）。
