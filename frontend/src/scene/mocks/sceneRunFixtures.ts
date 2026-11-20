import type { RuntimeEvidence } from "../contract";
import type { RubricScores } from "../../objects/gallery/RubricScores";
import type { SceneBrief } from "../../objects/gallery/SceneBrief";
import type { SceneReview } from "../../objects/gallery/SceneReview";
import type { SceneRunView } from "../../objects/gallery/SceneRunView";

/**
 * ScenePanel 测试夹具（后端 task-32 就绪前用 fixture 驱动 UI 状态机与渲染；
 * 生产路径由 SceneApiClient 注入真实 API 客户端）。
 */
export const createSceneBriefFixture = (overrides: Partial<SceneBrief> = {}): SceneBrief => ({
  mood: "潮湿而安静的海边黄昏",
  memoryReading: "照片里的黑色礁石与青绿色海水，像一次缓慢退潮后的记忆。",
  scenePrompt: "【任务】用 Three.js 生成可沉浸游览的三维记忆场景……",
  entranceNarration: "走进这片退潮后的海岸，让记忆慢慢浮现。",
  palette: ["#0B1519", "#5E8FA0", "#D9C3A5"],
  avoid: ["空场景", "照片被粒子吞没", "过曝"],
  userHint: null,
  ...overrides,
});

export const createRubricScoresFixture = (overrides: Partial<RubricScores> = {}): RubricScores => ({
  moodMatch: 4,
  photoPresence: 5,
  composition: 4,
  lightingColor: 3,
  completeness: 4,
  ...overrides,
});

export const createSceneReviewFixture = (overrides: Partial<SceneReview> = {}): SceneReview => ({
  scores: createRubricScoresFixture(),
  verdict: "pass",
  issues: ["左侧远景偏暗，可补一盏暖色轮廓光"],
  summary: "场景把照片作为可辨认的记忆平面，冷色海雾与暖色轮廓光形成记忆对比。",
  ...overrides,
});

export const createSceneRunFixture = (overrides: Partial<SceneRunView> = {}): SceneRunView => ({
  runId: "11111111-1111-4111-8111-111111111111",
  exhibitionId: "22222222-2222-4222-8222-222222222222",
  status: "generating",
  source: null,
  attempts: 0,
  kind: "generate",
  parentRunId: null,
  revisionInstruction: null,
  isCurrent: false, dismissed: false,
  hint: null,
  photoIds: ["photo-1", "photo-2", "photo-3"],
  curationVersion: 3,
  brief: null,
  code: null,
  review: null,
  errorCode: null,
  errorMessage: null,
  createdAt: "2026-10-27T12:00:00Z",
  updatedAt: "2026-10-27T12:00:00Z",
  ...overrides,
});

/** 已成功且带评审结果的运行（用于结果区渲染测试）。 */
export const createSucceededSceneRunFixture = (): SceneRunView =>
  createSceneRunFixture({
    status: "succeeded",
    source: "ai",
    attempts: 1,
    isCurrent: true, dismissed: false,
    brief: createSceneBriefFixture(),
    code: "function build(ctx) { ctx.setBackground(0x0b1519); }",
    review: createSceneReviewFixture(),
    updatedAt: "2026-10-27T12:03:00Z",
  });

/** 契约 §4.1 客户端运行时证据夹具（沙箱回传形状）。 */
export const createRuntimeEvidenceFixture = (): RuntimeEvidence => ({
  runtimeVersion: 1,
  buildMs: 3.4,
  texturesMs: 15.2,
  firstFrameMs: 210.7,
  fps: 58.2,
  errors: [],
  photoIdsUsed: ["photo-1", "photo-2", "photo-3"],
  photoCount: 3,
  networkAttempts: 0,
  networkAttemptDetails: [],
  cspViolations: [],
  framesRendered: 61,
  canvas: { width: 1125, height: 703 },
  drawStats: { calls: 9, triangles: 128, points: 240 },
  webgl: { version: "WebGL 2.0", renderer: "ANGLE", vendor: "Google Inc.", maxTextureSize: 16384 },
  orbitControls: true,
  sessionElapsedMs: 1200,
});
