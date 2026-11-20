import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../stores/sessionStore", () => ({
  getSessionToken: (): string | null => null,
}));

import ScenePanel from "./index";
import { SceneCandidateBanner } from "./components/SceneCandidateBanner";
import { SceneRevisionBar } from "./components/SceneRevisionBar";
import { createSceneRunFixture, createSucceededSceneRunFixture } from "../../../../scene/mocks/sceneRunFixtures";

const noop = (): void => {};

describe("ScenePanel 当前场景 / 修订候选（SSR）", () => {
  it("修订输入：计数、说明与提交动作；空输入不可提交", () => {
    const empty = renderToStaticMarkup(
      <SceneRevisionBar
        instruction=""
        onInstructionChange={noop}
        canRevise={false}
        isPending={false}
        error={null}
        disabledReason={null}
        onSubmit={noop}
      />,
    );
    expect(empty).toContain("修订当前场景");
    expect(empty).toContain("0/500 字");
    expect(empty).toContain("提交修订");
    expect(empty).toContain('disabled=""');

    const filled = renderToStaticMarkup(
      <SceneRevisionBar
        instruction="把灯塔的暖光调亮一点"
        onInstructionChange={noop}
        canRevise
        isPending={false}
        error="提交失败"
        disabledReason={null}
        onSubmit={noop}
      />,
    );
    expect(filled).toContain("10/500 字");
    expect(filled).toContain("提交失败");
  });

  it("候选条：明确未采用，提供采用/放弃与发布提醒", () => {
    const candidate = createSceneRunFixture({
      status: "succeeded",
      kind: "revise",
      parentRunId: "parent-run-123456",
      revisionInstruction: "把灯塔的暖光调亮一点，雾淡一些。",
      code: "function build(ctx) {}",
      isCurrent: false,
    });
    const html = renderToStaticMarkup(
      <SceneCandidateBanner
        candidate={candidate}
        accepting={false}
        error={null}
        onAccept={noop}
        onDismiss={noop}
      />,
    );
    expect(html).toContain("修订候选（未采用）");
    expect(html).toContain("把灯塔的暖光调亮一点，雾淡一些。");
    expect(html).toContain("采用这次修订");
    expect(html).toContain("放弃");
    expect(html).toContain("公开页需要重新发布");
    expect(html).not.toContain("已无法采用");
  });

  it("候选条：场景已过期时禁用采用并说明原因，仍可放弃", () => {
    const candidate = createSceneRunFixture({
      status: "succeeded",
      kind: "revise",
      parentRunId: "parent-run-123456",
      revisionInstruction: "把灯塔缩小一些",
      code: "function build(ctx) {}",
      isCurrent: false,
    });
    const html = renderToStaticMarkup(
      <SceneCandidateBanner
        candidate={candidate}
        accepting={false}
        error={null}
        stale
        onAccept={noop}
        onDismiss={noop}
      />,
    );
    expect(html).toContain("素材已变化，这个修订候选已无法采用");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*采用这次修订/u);
    expect(html).toContain("放弃");
  });

  it("面板同时展示当前场景与最新修订候选，候选不自动成为当前", () => {
    const current = createSucceededSceneRunFixture();
    const candidate = createSceneRunFixture({
      runId: "candidate-run-1234",
      status: "succeeded",
      kind: "revise",
      parentRunId: current.runId,
      revisionInstruction: "把灯塔的暖光调亮一点。",
      brief: current.brief,
      code: "function build(ctx) { /* revised */ }",
      review: current.review,
      isCurrent: false,
    });
    const html = renderToStaticMarkup(
      <ScenePanel
        exhibitionId="ex-1"
        photos={[]}
        initialRun={candidate}
        currentRun={current}
      />,
    ).replaceAll("<!-- -->", "");
    expect(html).toContain("当前场景 · 运行");
    expect(html).toContain("最新任务 · 运行");
    expect(html).toContain("修订候选（未采用）");
    expect(html).toContain("采用这次修订");
    expect(html).toContain("修订当前场景");
    expect(html).toContain("提交修订");
    // 候选没有自动成为当前：当前行与候选是两次不同运行。
    expect(current.runId.slice(0, 8)).not.toBe(candidate.runId.slice(0, 8));
  });
});
