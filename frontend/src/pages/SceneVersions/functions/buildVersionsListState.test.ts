import { describe, expect, it } from "vitest";
import type { SceneRunSummary } from "../../../objects/scene/SceneRunSummary";
import { buildVersionsListState, effectiveSelection, initialSelection } from "./buildVersionsListState";

const base: SceneRunSummary = {
  runId: "r-old",
  status: "succeeded",
  source: "ai",
  attempts: 1,
  kind: "generate",  parentRunId: null,  revisionInstruction: null,  acceptable: false, dismissed: false,  hint: null,
  mood: "雾",
  scores: null,
  weightedScore: 3.4,
  reviewSummary: null,
  errorMessage: null,
  restoredFrom: null,
  isCurrent: false,
  matchesCurrentDraft: true,
  restorable: true,
  createdAt: "2026-10-31T08:00:00Z",
};

describe("buildVersionsListState", () => {
  it("没有运行时为 empty", () => {
    expect(buildVersionsListState([])).toEqual({ status: "empty" });
  });

  it("有运行时为 ready 且保持服务端顺序", () => {
    const runs = [{ ...base, runId: "r-new" }, base];
    expect(buildVersionsListState(runs)).toEqual({ status: "ready", runs });
  });
});

describe("initialSelection", () => {
  it("优先当前版本，其次可采用的修订候选，再次第一条成功运行，最后第一条", () => {
    const failed: SceneRunSummary = { ...base, runId: "r-failed", status: "failed", restorable: false };
    const current: SceneRunSummary = { ...base, runId: "r-current", isCurrent: true };
    const acceptable: SceneRunSummary = {
      ...base,
      runId: "r-candidate",
      isCurrent: false,
      acceptable: true,
    };
    expect(initialSelection([failed, acceptable, base, current])).toBe("r-current");
    expect(initialSelection([failed, acceptable, base])).toBe("r-candidate");
    expect(initialSelection([failed, base])).toBe("r-old");
    expect(initialSelection([failed])).toBe("r-failed");
    expect(initialSelection([])).toBeNull();
  });
});

describe("effectiveSelection", () => {
  it("用户选择仍在列表中时保留，否则回到默认选中", () => {
    const current: SceneRunSummary = { ...base, runId: "r-current", isCurrent: true };
    expect(effectiveSelection([base, current], "r-old")).toBe("r-old");
    expect(effectiveSelection([base, current], "r-restored")).toBe("r-current");
    expect(effectiveSelection([base, current], null)).toBe("r-current");
    expect(effectiveSelection([], "r-old")).toBeNull();
  });
});
