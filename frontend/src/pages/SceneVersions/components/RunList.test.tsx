import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SceneRunSummary } from "../../../objects/scene/SceneRunSummary";
import { RunList } from "./RunList";

const run = (overrides: Partial<SceneRunSummary> = {}): SceneRunSummary => ({
  runId: "run-1",
  status: "succeeded",
  source: "ai",
  attempts: 1,
  kind: "generate",
  parentRunId: null,
  revisionInstruction: null,
  hint: null,
  mood: "雾中的眷恋",
  scores: null,
  weightedScore: 3.5,
  reviewSummary: null,
  errorMessage: null,
  restoredFrom: null,
  isCurrent: false,
  acceptable: false, dismissed: false,
  matchesCurrentDraft: true,
  restorable: true,
  createdAt: "2026-11-04T02:10:00Z",
  ...overrides,
});

const render = (runs: readonly SceneRunSummary[]): string =>
  renderToStaticMarkup(<RunList runs={runs} selectedRunId={null} onSelect={vi.fn()} />).replaceAll(
    "<!-- -->",
    "",
  );

describe("场景版本列表", () => {
  it("修订运行在列表里直接显示修订要求，普通生成运行没有这一行", () => {
    const html = render([
      run({ runId: "run-revise", kind: "revise", revisionInstruction: "把灯塔缩小一些" }),
      run({ runId: "run-generate" }),
    ]);
    expect(html).toContain("修订：把灯塔缩小一些");
    expect(html.match(/修订：/gu)).toHaveLength(1);
  });
});
