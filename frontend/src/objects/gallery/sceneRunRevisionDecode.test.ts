import { describe, expect, it } from "vitest";
import { ApiError } from "../../apis/shared/ApiError";
import { createSceneRunFixture, createSucceededSceneRunFixture } from "../../scene/mocks/sceneRunFixtures";
import { parseSceneRunView } from "./SceneRunView";
import { parseExhibitionDetail } from "./ExhibitionDetail";
import { parseSceneRunSummary } from "../scene/SceneRunSummary";
import { createMapPanelDetail } from "../../pages/Workspace/components/MapPanel/mocks/mapPanelFixtures";

const withoutRevisionFields = (run: ReturnType<typeof createSceneRunFixture>): Record<string, unknown> => {
  const { kind, parentRunId, revisionInstruction, isCurrent, ...legacy } = run;
  return legacy;
};

describe("SceneRunView v1.14 字段与旧数据兼容", () => {
  it("解析 kind/parentRunId/revisionInstruction/isCurrent", () => {
    const parsed = parseSceneRunView(
      createSceneRunFixture({
        kind: "revise",
        parentRunId: "parent-1",
        revisionInstruction: "把灯塔的暖光调亮一点。",
        isCurrent: false,
      }),
    );
    expect(parsed.kind).toBe("revise");
    expect(parsed.parentRunId).toBe("parent-1");
    expect(parsed.revisionInstruction).toBe("把灯塔的暖光调亮一点。");
    expect(parsed.isCurrent).toBe(false);
  });

  it("旧数据缺字段时默认 generate/null/false", () => {
    const parsed = parseSceneRunView(withoutRevisionFields(createSucceededSceneRunFixture()));
    expect(parsed.kind).toBe("generate");
    expect(parsed.parentRunId).toBeNull();
    expect(parsed.revisionInstruction).toBeNull();
    expect(parsed.isCurrent).toBe(false);
  });

  it("kind 非法时拒绝并带字段路径", () => {
    expect(() =>
      parseSceneRunView({ ...createSceneRunFixture(), kind: "accept" }),
    ).toThrow(/sceneRun\.kind/);
  });

  it("模型失败错误码可由统一场景错误描述", () => {
    const error = new ApiError({
      status: 409,
      code: "CONFLICT",
      reason: "SCENE_REVISION_STALE",
      message: "backend",
    });
    expect(error.reason).toBe("SCENE_REVISION_STALE");
  });
});

describe("ExhibitionDetail.currentSceneRun（v1.14）", () => {
  it("旧数据缺 currentSceneRun 时回退到最新 sceneRun", () => {
    const detail = createMapPanelDetail({ sceneRun: createSucceededSceneRunFixture() });
    const { currentSceneRun, ...legacy } = detail;
    const parsed = parseExhibitionDetail(legacy);
    expect(parsed.sceneRun?.runId).toBe(detail.sceneRun?.runId);
    expect(parsed.currentSceneRun?.runId).toBe(detail.sceneRun?.runId);
    expect(currentSceneRun).toBeDefined();
  });

  it("显式 currentSceneRun=null 时不被最新运行顶替", () => {
    const detail = createMapPanelDetail({ sceneRun: createSucceededSceneRunFixture() });
    const parsed = parseExhibitionDetail({ ...detail, currentSceneRun: null });
    expect(parsed.sceneRun).not.toBeNull();
    expect(parsed.currentSceneRun).toBeNull();
  });
});

describe("SceneRunSummary v1.14 字段与旧数据兼容", () => {
  const base = {
    runId: "r1",
    status: "succeeded",
    source: "ai",
    attempts: 1,
    hint: null,
    mood: null,
    scores: null,
    weightedScore: null,
    reviewSummary: null,
    errorMessage: null,
    restoredFrom: null,
    isCurrent: false,
    matchesCurrentDraft: true,
    restorable: true,
    createdAt: "2026-11-04T00:00:00Z",
  } as const;

  it("解析 kind/parentRunId/acceptable", () => {
    const parsed = parseSceneRunSummary({
      ...base,
      kind: "revise",
      parentRunId: "parent-1",
      acceptable: true,
    });
    expect(parsed.kind).toBe("revise");
    expect(parsed.parentRunId).toBe("parent-1");
    expect(parsed.acceptable).toBe(true);
  });

  it("旧数据缺新字段时默认 generate/null/false", () => {
    const parsed = parseSceneRunSummary(base);
    expect(parsed.kind).toBe("generate");
    expect(parsed.parentRunId).toBeNull();
    expect(parsed.acceptable).toBe(false);
  });
});
