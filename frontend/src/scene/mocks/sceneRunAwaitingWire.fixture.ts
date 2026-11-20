/**
 * 真实 wire 夹具（task-31 / D4 E2E）：
 * 2026-10-27 对 8080（AI_MODE=fake）跑「注册→建展览→上传 3 张→updatecuration 分组→generatescene→轮询」
 * 后 getscenerun 的**实测响应原文**（status=awaiting_capture；Option 字段全部显式 null）。
 * 用途：锁定前端 SceneRunView 解码与真实后端形状的一致性，后端改字段/省略 null 会在此回归失败。
 */
export const SCENE_RUN_AWAITING_CAPTURE_WIRE_FIXTURE ={
  "runId": "c0503666-c009-443b-8493-7b9244605212",
  "exhibitionId": "44f89935-2508-46fd-abd6-8d4804e210e9",
  "status": "awaiting_capture",
  "source": "ai",
  "attempts": 0,
  "hint": "像退潮后的海边，安静、潮湿、有一点怀念。",
  "photoIds": [
    "21b79ebf-e403-43e1-a17c-66978c793594",
    "2a46f35f-2db8-4f93-8387-2f5d56c0599a",
    "2239070b-bf34-42f7-8e46-62bdf2cddecd"
  ],
  "curationVersion": 2,
  "brief": {
    "mood": "安静的眷恋",
    "memoryReading": "海边的光、退潮的痕迹与山间的清晨，把这趟旅程收束成一种克制的想念。",
    "scenePrompt": "【任务】用 Three.js 生成一个可沉浸游览的三维记忆场景，表达这组照片的情绪与记忆；场景不是照片陈列墙，但照片必须作为可辨认的记忆出现。\n\n【情绪与记忆】安静的眷恋。用户希望：像退潮后的海边，安静、潮湿、有一点怀念。。\n\n【照片叙事】共 3 张，按章节顺序：章节「退潮的礁石」：海岸记忆 1、海岸记忆 2；章节「远处的光」：海岸记忆 3。所有照片都要出现在场景中，可辨认、可点击查看大图与图注。\n\n【场景与空间】主体：一圈微微漂浮的相纸承载面环绕中心，中心是一块低多边形礁石状体块；首屏相机高度约 1.6m，能看到全部照片与主体关系；世界半径约 4.5m。\n\n【光照与色彩】时间：黄昏；主光：右前方低角度暖光，环境光偏冷，照片承载面带柔和自发光；色调：#1B2A4A、#F2A65A、#E8D5B7；材质：磨砂相纸、湿润石面、半透明雾。\n\n【交互与运动】Orbit 旋转/缩放/复位；照片缓慢呼吸浮动、雾气缓慢漂移，幅度克制不眩晕。\n\n【技术与性能】使用 ctx API（THREE/scene/camera/renderer/photos）；不得联网、不得加载外部资源、不得操作 DOM；代码不超过 60 KB；目标 60fps、最低 20fps；照片纹理由宿主提供。\n\n【避免】逐块 Mesh 导致 fps 崩；方块贴图墙吞照片；空场景或大面积纯色；照片被粒子吞没；过曝或全黑。",
    "entranceNarration": "沿着潮声走进这片黄昏，照片在雾里慢慢亮起来。",
    "palette": [
      "#1B2A4A",
      "#F2A65A",
      "#E8D5B7"
    ],
    "avoid": [
      "逐块 Mesh 导致 fps 崩",
      "方块贴图墙吞照片",
      "空场景或大面积纯色",
      "照片被粒子吞没",
      "过曝或全黑"
    ],
    "userHint": "像退潮后的海边，安静、潮湿、有一点怀念。"
  },
  "code": "function build(ctx) {\n  const T = ctx.THREE;\n  ctx.setBackground(0x0f172a);\n  const photos = ctx.photos || [];\n  const radius = 4;\n  photos.forEach((photo, index) => {\n    const aspect = photo && photo.aspect ? photo.aspect : 1.5;\n    const mesh = new T.Mesh(\n      new T.PlaneGeometry(1.6, 1.6 / aspect),\n      new T.MeshBasicMaterial({ map: photo ? photo.texture : null })\n    );\n    const angle = (index / Math.max(1, photos.length)) * Math.PI * 2;\n    mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);\n    mesh.rotation.y = -Math.PI / 2 - angle;\n    ctx.scene.add(mesh);\n  });\n  ctx.camera.position.set(0, 1.8, 8);\n  ctx.camera.lookAt(0, 0.6, 0);\n  ctx.addOrbitControls();\n  ctx.onFrame((dt) => { ctx.scene.rotation.y += dt * 0.05; });\n}",
  "review": null,
  "errorCode": null,
  "errorMessage": null,
  "createdAt": "2026-10-27T14:48:16.646219Z",
  "updatedAt": "2026-10-27T14:48:16.646219Z"
};
