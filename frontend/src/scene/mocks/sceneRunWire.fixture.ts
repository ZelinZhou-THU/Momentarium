import type { SceneRunView } from "../../objects/gallery/SceneRunView";

/** Workspace 夹具：已成功运行（含题面/代码/评审，用于嵌套解码回归）。 */
export const SCENE_RUN_SUCCEEDED_FIXTURE: SceneRunView = {
  runId: "3f6e5c1a-1111-4a2b-8c3d-2b1f0e9d8c7b",
  exhibitionId: "7d2c9b4e-2222-4b3c-9d4e-5f6a7b8c9d0e",
  status: "succeeded",
  source: "ai",
  attempts: 1,
  kind: "generate",  parentRunId: null,  revisionInstruction: null,  isCurrent: false, dismissed: false,  hint: "像退潮后的海边，安静、潮湿、有一点怀念。",
  photoIds: ["a1b2c3d4-0001-4a2b-8c3d-000000000001", "a1b2c3d4-0002-4a2b-8c3d-000000000002", "a1b2c3d4-0003-4a2b-8c3d-000000000003"],
  curationVersion: 4,
  brief: {
    mood: "潮湿而安静的海边黄昏",
    memoryReading: "黑色礁石与青绿色海水像缓慢退潮后的记忆。",
    scenePrompt: "【任务】用 Three.js 生成可沉浸游览的三维记忆场景……",
    entranceNarration: "走进这片退潮后的海岸。",
    palette: ["#0B1519", "#5E8FA0", "#D9C3A5"],
    avoid: ["空场景", "照片被粒子吞没", "过曝"],
    userHint: "像退潮后的海边",
  },
  code: "function build(ctx) { ctx.setBackground(0x0b1519); }",
  review: {
    scores: { moodMatch: 4, photoPresence: 5, composition: 4, lightingColor: 3, completeness: 4 },
    verdict: "pass",
    issues: ["左侧远景偏暗，可补一盏暖色轮廓光"],
    summary: "场景把照片作为可辨认的记忆平面，冷暖对比形成记忆张力。",
  },
  errorCode: null,
  errorMessage: null,
  createdAt: "2026-10-27T12:03:00Z",
  updatedAt: "2026-10-27T12:03:00Z",
};

/** 契约 §4.2 reviewscene 的请求形状（服务端 RuntimeEvidence；用于前后端联调回归）。 */
export const SCENE_RUNTIME_EVIDENCE_WIRE_FIXTURE = {
  buildMs: 3,
  fps: 58.2,
  errors: [],
  photoIdsUsed: ["a1b2c3d4-0001-4a2b-8c3d-000000000001", "a1b2c3d4-0002-4a2b-8c3d-000000000002", "a1b2c3d4-0003-4a2b-8c3d-000000000003"],
  networkAttempts: 0,
};
