# 高设计感纯环境参考场景（task-56）

目标：为「私人记忆档案馆」提供 2–3 个**手写、纯环境、高设计感**的参考场景，解决生成结果"石头球+雪花、水面平淡、盒子+三棱柱"的观感问题。三段场景均可直接作为 prompt few-shot 与 Fallback/Fake 模板候选。

## 交付清单

| 场景 | 代码 | 大小 | 截图（初始 / +35°） |
|---|---|---|---|
| 雾中记忆档案馆（海岸 + 水面 + 记忆小屋 + 灯塔） | `backend/src/main/resources/scene/fallback/foggy-coast.js` | **12,258B**（≤12KB） | `evidence/design-foggy-coast-{initial,azimuth35}.jpg` |
| 雨夜街角（街角建筑 + 霓虹 + 湿街反射 + 雨丝） | `scenes/rainy-street.js` | **12,249B** | `evidence/design-rainy-street-{initial,azimuth35}.jpg` |
| 室内记忆厅（天窗光束 + 材质层次 + 尘粒） | `scenes/interior-hall.js` | **10,230B** | `evidence/design-interior-hall-{initial,azimuth35}.jpg` |

> 2026-10-29 起子代码提示词的 few-shot 改为可读片段库 `backend/src/main/resources/scene/snippets/`（由本目录三段场景拆出、按构件咬合重做），评审画廊为本目录 `snippets.html`（`node probe.mjs --serve` 后打开 `http://127.0.0.1:4321/prototypes/three/design-refs/snippets.html`；`node probe.mjs --snippets` 无头渲染截图到 `evidence/snippets/`）。2026-10-30 起片段库新增 `trees`（阔叶树 + 选址检查），画廊新增“树”“绿坡小屋”演示。下面的压缩片段只作历史留存。

few-shot 片段（历史，已不再嵌入提示词）：
- 水面：`snippets/prompt-a-water.min.js`（2,044B，DataTexture 无 DOM）
- 建筑：`snippets/prompt-b-building.min.js`（1,818B）
- 带注释完整版：`snippets/building-detail.js`（水面完整实现见 `backend/src/main/resources/scene/fallback/foggy-coast.js`）

## 渲染验证（design-refs probe，headless Edge 155，1005×628，本地临时静态服务）

树冠避让回归：`node --test prototypes/three/design-refs/trees.test.mjs`（仓库根目录执行；使用真实几何检查种子、尺寸、旋转及建筑／视线走廊边界，无需模型调用）。

| 场景 | fps | buildMs | drawCalls | triangles | photoIdsUsed | errors | network |
|---|---|---|---|---|---|---|---|
| foggy-coast | 37.5 | 22.5 | 79 | 7,622 | **[]（纯环境）** | 0 | 0 |
| rainy-street | 50.7 | 6.4 | 112 | 1,328 | **[]** | 0 | 0 |
| interior-hall | 76.6 | 7.9 | 66 | 866 | **[]** | 0 | 0 |

- 全部场景：单函数 `function build(ctx)`、≤12KB、无照片实体、无 `ctx.photos`、无 `document`/网络、满足沙箱契约；`ctx.addOrbitControls` 正常（runtime 支持 target/minDistance/maxDistance）。
- 复跑：`node prototypes/three/design-refs/probe.mjs`（自动起临时本机服务、写截图+`design-refs-report.json`，校验 JPEG magic/大小/JSON）；指定场景：`--scenes=foggy-coast`。

## A) 水面怎么落地（`foggy-coast.js`）

1. **可读表面 = 几何波动 + 法线细节 + 受控反射**，三层叠加：
   - 顶点波动：`PlaneGeometry(38,19,76,38)`（≈0.5m/格），三层 sin 叠加：
     `0.075·sin(0.55x+0.9t) + 0.052·sin(0.8y−1.25t) + 0.018·sin(1.6d−1.8t)`（振幅米、速度 rad/s），每帧更新 Z + `computeVertexNormals()`。
   - 程序化法线贴图（DataTexture 128²）：由 h(x,y)=sin(0.16x+0.05y)+sin(0.21y−0.04x) 求梯度编码为法线，`normalScale(0.75,0.75)`、`repeat(7,4)`、offset 每帧滚动 → 波面高光有细碎纹理，避免"条纹布"。
   - 受控反射：`WebGLCubeRenderTarget(128)+CubeCamera` 建场景后**一次性** `update(renderer, scene)`，水面材质 `roughness .2 / metalness .55 / envMapIntensity .9`；湿地面复用同 envMap。
2. **两层程序化波纹/条纹**（截图可读）：DataTexture 生成 26/48 密度波浪线，additive 叠加、opacity `.09/.05`、反向 offset 滚动（+0.012/+0.006 与 −0.02/+0.01 rad/s）；低不透明度避免"布纹感"。
3. **岸线泡沫亮带**：DataTexture 随机圆点 + `TorusGeometry(4.6,0.22,4,40,π·0.62)` 弧段（另一条 3.9/0.2/0.55π），贴水 y=.12，additive、opacity `.72–.85` 呼吸。
4. 雾：`FogExp2(0x9fb2ba, 0.032)` + 亮天空背景；主光侧向（暖）与背侧冷轮廓光，水面高光与雾色统一，避免近黑剪影。

## B) 建筑细节怎么落地（10 个可辨认构件，米制）

以 `foggy-coast.js` 小屋（屋身 3.1×2.25×2.05m，总高≈3.2m）为例：
1) 基座（石板 3.5×0.42×2.7m，出边收口）；2) 3 级台阶（每级缩进 0.16m）；3) 错层墙体（主墙 + 后侧 1.4×2.35m 体块，形成两个体量）；4) 双坡屋顶（两片 4.05m 长斜板 > 墙宽 3.1m → 0.45m 出檐）+ 屋脊；5) 四面檐口线脚（4.0×0.09m 薄板叠层）；6) 窗框 + 暖光窗（3 樘，0.82×1.0m：深木外框/木内框/暖光玻璃/上下窗台石）；7) 门（0.62×1.4m）+ 门眉石 + 门前石阶；8) 烟囱 + 压顶；9) 临海栏杆（6 柱 ×0.7m 间距 + 上下横杆）；10) 金属壁灯（支架 + 遮雨檐 + 暖光玻璃 + Sprite 光晕）。
材质分区：石/顶/木/金属/暖光；细节靠**薄板叠层（檐口/窗台/门眉/压顶）+ 出檐大于墙宽 + 错层体量 + 窗框分层**，面数保持低多边形。

雨夜街角（`rainy-street.js`）在同样原则下增加：三层檐口线脚、窗格网格（2 层×多樘暖窗/冷窗）、木框店面+门+暖光内光、斜面雨棚+支撑+檐边、霓虹竖招牌（发光板+金属框+光晕）、落水管、台阶+栏杆、街灯（杆/臂/灯头/光晕/锥形光柱/SpotLight）、远处街景体块+点窗、湿街 CubeCamera 反射 + 水洼 + 地面反射光带 + 雨丝 LineSegments + 前景雨棚边缘遮挡。

室内记忆厅（`interior-hall.js`）：地板木纹 DataTexture + 三面墙 + 顶棚与天窗框/分格 + 斜向体积光锥 + 地面光斑 + 4 根石柱/横梁 + 右侧高窗框/竖梃/窗台 + 楼梯 6 级+栏杆 + 长凳 + 壁灯 + 抽象石牌；冷暖分层光 + 尘埃 Points。

## 构图/光/材质/颜色规则（可直接写进提示词）

- 首屏主体占比 40–60%：地标（灯塔/街角建筑/拱门）落在画面中轴附近，前景 1/3 保留可读表面（水面/湿街/地面光斑），**不要大片空带**。
- 避免近黑：背景/雾/地面用中明度冷灰（如 #22313B、#2B3A42、#9FB2BA），暗部靠暖光窗/霓虹/Sprite 光晕提亮；主光可读（侧向暖主光 + 冷环境/轮廓）。
- 材质分区：石（rough .85）、金属（metal .7）、木（rough .72）、暖光玻璃（emissive 1.9–3）、湿面（rough .05–.2, metal .6–.9 + envMap）。
- 水面/湿面必须"可读"：几何波动 + 法线/条纹细节 + 泡沫或反射光带三者至少两种；反射用一次性 CubeCamera，不逐帧重渲染。
- 纯环境：不创建照片/相框/照片墙，不访问 `ctx.photos`；照片情绪由窗光、雾、水面、尘粒等意象承载。

## few-shot 嵌入建议（ai-lead-b）

- 水面片段整体嵌入（`prompt-a-water.min.js`）：改颜色/尺寸时保留"波动 + 法线/条纹 + 泡沫 + 一次性反射"四件套；不要用 `document.createElement('canvas')`（沙箱无 DOM 约束），统一用 `DataTexture`。
- 建筑片段（`prompt-b-building.min.js`）：保留 10 构件清单与米制尺度，禁止"盒子+三棱柱"；新增构件按"薄板叠层 + 材质分区"扩展。
- 兜底/Fake 模板：可直接用 `foggy-coast.js` 原文（12,258B，纯环境、errors=[]、headless fps≈38，满足硬门禁）。

## 局限

- headless fps 受环境波动（37–77），不代表真实 GPU；drawCalls 偏高（79–112）来自大量独立薄板构件，真实浏览器仍轻松 60fps。
- 水面法线贴图/箔条参数为手调美术值，可按题面情绪调整色温与速度；不同相机高度需重调泡沫弧位置。
