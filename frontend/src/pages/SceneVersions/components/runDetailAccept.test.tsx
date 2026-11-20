import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SceneRunSummary } from "../../../objects/scene/SceneRunSummary";
import { createSceneRunFixture } from "../../../scene/mocks/sceneRunFixtures";
import { RunDetail } from "./RunDetail";

const summary = (overrides: Partial<SceneRunSummary> = {}): SceneRunSummary => ({
  runId: "run-revise-12345678",
  status: "succeeded",
  source: "ai",
  attempts: 1,
  kind: "revise",
  parentRunId: "run-parent-87654321",
  revisionInstruction: null,
  hint: null,
  mood: "雾散后的暖光",
  scores: null,
  weightedScore: 3.5,
  reviewSummary: "整体成立",
  errorMessage: null,
  restoredFrom: null,
  isCurrent: false,
  acceptable: true,
  dismissed: false,
  matchesCurrentDraft: true,
  restorable: false,
  createdAt: "2026-11-04T02:10:00Z",
  ...overrides,
});

const render = (value: SceneRunSummary): string =>
  renderToStaticMarkup(
    <RunDetail
      summary={value}
      preview={{ status: "idle" }}
      photos={{ status: "loading" }}
      onRestore={vi.fn()}
      onAccept={vi.fn()}
      accepting={false}
      acceptError={null}
    />,
  ).replaceAll("<!-- -->", "");

describe("场景版本详情：采用修订候选", () => {
  it("服务端 acceptable=true 时显示采用按钮、候选徽标与父版本", () => {
    const html = render(summary());
    expect(html).toContain("采用这次修订");
    expect(html).toContain("修订候选 · 可采用");
    expect(html).toContain("基于上一版本");
    expect(html).toContain("修订运行");
    expect(html).toContain("父版本");
    expect(html).toContain("公开页需要重新发布");
  });

  it("修订版本在详情里显示当时的修订要求；生成版本没有这一行", () => {
    const renderWithRun = (instruction: string | null): string =>
      renderToStaticMarkup(
        <RunDetail
          summary={summary()}
          preview={{
            status: "ready",
            run: createSceneRunFixture({ kind: "revise", revisionInstruction: instruction }),
          }}
          photos={{ status: "loading" }}
          onRestore={vi.fn()}
          onAccept={vi.fn()}
          accepting={false}
          acceptError={null}
        />,
      ).replaceAll("<!-- -->", "");
    expect(renderWithRun("把灯塔的暖光调亮一点")).toContain("修订要求：把灯塔的暖光调亮一点");
    expect(renderWithRun(null)).not.toContain("修订要求");
  });

  it("当前运行不显示采用按钮；不可采用候选也不显示", () => {
    expect(render(summary({ isCurrent: true, acceptable: false }))).not.toContain(
      "采用这次修订",
    );
    expect(render(summary({ acceptable: false }))).not.toContain("采用这次修订");
  });

  it("采用失败展示可读错误", () => {
    const html = renderToStaticMarkup(
      <RunDetail
        summary={summary()}
        preview={{ status: "idle" }}
        photos={{ status: "loading" }}
        onRestore={vi.fn()}
        onAccept={vi.fn()}
        accepting={false}
        acceptError="父版本已不是当前场景，不能采用。"
      />,
    );
    expect(html).toContain("父版本已不是当前场景");
  });
});
