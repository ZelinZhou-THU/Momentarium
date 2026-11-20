import { describe, expect, it } from "vitest";
import type { SceneRunSummary } from "../../../objects/scene/SceneRunSummary";
import { describeRunSummary } from "./describeRunSummary";

const run: SceneRunSummary = {
  runId: "r1",
  status: "succeeded",
  source: "ai",
  attempts: 2,
  kind: "generate",  parentRunId: null,  revisionInstruction: null,  acceptable: false, dismissed: false,  hint: null,
  mood: "雾中的眷恋",
  scores: null,
  weightedScore: 3.304,
  reviewSummary: "整体成立",
  errorMessage: null,
  restoredFrom: null,
  isCurrent: true,
  matchesCurrentDraft: true,
  restorable: true,
  createdAt: "2026-10-31T08:00:00Z",
};

describe("describeRunSummary", () => {
  it("成功的 AI 运行：标签、两位小数分数、修订次数、当前徽标", () => {
    expect(describeRunSummary(run)).toEqual({
      statusLabel: "成功",
      kindLabel: "生成",
      sourceLabel: "AI 生成",
      scoreLabel: "3.30 分",
      attemptsLabel: "修订 2 次",
      badges: ["当前场景"],
      tone: "success",
    });
  });

  it("修订候选：kind 标签、可采用与父版本徽标", () => {
    const view = describeRunSummary({
      ...run,
      kind: "revise",
      parentRunId: "r-parent",
      isCurrent: false,
      acceptable: true,
      restoredFrom: null,
    });
    expect(view.kindLabel).toBe("修订");
    expect(view.badges).toEqual(["修订候选 · 可采用", "基于上一版本"]);
  });

  it("已放弃的修订候选标注「已放弃」，不再显示可采用", () => {
    const view = describeRunSummary({
      ...run,
      kind: "revise",
      parentRunId: "r-parent",
      isCurrent: false,
      acceptable: false,
      dismissed: true,
    });
    expect(view.badges).toEqual(["已放弃 · 不再提示", "基于上一版本"]);
  });

  it("兜底、恢复而来、素材已变化都体现在徽标里", () => {
    const view = describeRunSummary({
      ...run,
      source: "fallback",
      isCurrent: false,
      restoredFrom: "r0",
      matchesCurrentDraft: false,
    });
    expect(view.sourceLabel).toBe("兜底场景");
    expect(view.badges).toEqual(["由旧版本恢复", "素材已变化"]);
  });

  it("失败与停止没有分数，语气为 muted", () => {
    const failed = describeRunSummary({ ...run, status: "failed", weightedScore: null, attempts: 0, isCurrent: false });
    expect(failed.statusLabel).toBe("失败");
    expect(failed.scoreLabel).toBeNull();
    expect(failed.attemptsLabel).toBeNull();
    expect(failed.tone).toBe("muted");
    expect(describeRunSummary({ ...run, status: "cancelled", isCurrent: false }).statusLabel).toBe("已停止");
  });

  it("进行中的运行语气为 active", () => {
    expect(describeRunSummary({ ...run, status: "reviewing", isCurrent: false }).tone).toBe("active");
  });
});
