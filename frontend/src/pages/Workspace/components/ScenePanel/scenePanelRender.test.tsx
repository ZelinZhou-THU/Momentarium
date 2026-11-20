import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SceneRunView } from "../../../../objects/gallery/SceneRunView";
import type { ScenePanelState, ScenePanelStatus } from "./objects/ScenePanelState";
import { SceneCoverAction } from "./components/SceneCoverAction";
import { ScenePromptBar } from "./components/ScenePromptBar";
import { SceneRunResult } from "./components/SceneRunResult";
import { SceneStageTimeline } from "./components/SceneStageTimeline";
import {
  createSceneReviewFixture,
  createSceneRunFixture,
  createSucceededSceneRunFixture,
} from "../../../../scene/mocks/sceneRunFixtures";

const createState = (status: ScenePanelStatus, run: SceneRunView | null = null): ScenePanelState => {
  if (status === "loading" || status === "idle") return { status, run: null, message: null, captureAttempt: 0 };
  if (status === "error") return { status, run, message: "操作失败", captureAttempt: 0 };
  return { status, run: run ?? createSceneRunFixture({ status: status === "capturing" ? "awaiting_capture" : status }), message: null, captureAttempt: 0 };
};

const noop = (): void => {};

/** React SSR 会在相邻文本节点之间插入 `<!-- -->`，断言前先去掉，避免误判。 */
const normalizeHtml = (html: string): string => html.replaceAll("<!-- -->", "");

describe("ScenePanel 各状态可渲染（fixture 驱动，后端就绪前的 UI 证据）", () => {
  it("封面操作可在无评审的成功场景使用，未就绪时禁用", () => {
    const ready = renderToString(<SceneCoverAction enabled status="idle" onCapture={noop} />);
    const blocked = renderToString(<SceneCoverAction enabled={false} status="idle" onCapture={noop} />);
    expect(ready).toContain("将当前视角设为封面");
    expect(ready).not.toContain('disabled=""');
    expect(blocked).toContain('disabled=""');
  });

  it("阶段进度条覆盖全部状态", () => {
    const statuses: ScenePanelStatus[] = [
      "loading",
      "idle",
      "queued",
      "generating",
      "awaiting_capture",
      "capturing",
      "reviewing",
      "succeeded",
      "failed",
      "cancelled",
      "error",
    ];
    for (const status of statuses) {
      const html = renderToString(<SceneStageTimeline state={createState(status)} />);
      expect(html).toContain("场景生成阶段");
    }
  });

  it("氛围提示输入展示字数与生成动作", () => {
    const html = renderToString(
      <ScenePromptBar
        hint="雨后海边"
        onHintChange={noop}
        maxLength={80}
        canGenerate={true}
        canCancel={false}
        isActionPending={false}
        onGenerate={noop}
        onCancel={noop}
      />,
    );
    expect(html).toContain("氛围提示");
    expect(html).toContain("4/80 字");
    expect(html).toContain("生成三维场景");
  });

  it("成功状态展示五维评分、结论、问题与重新生成", () => {
    const html = normalizeHtml(
      renderToString(
        <SceneRunResult
          state={createState("succeeded", createSucceededSceneRunFixture())}
          onRegenerate={noop}
          onRetryCapture={noop}
          onReload={noop}
        />,
      ),
    );
    expect(html).toContain("评审结果");
    expect(html).toContain("评审通过");
    expect(html).toContain("4/5");
    expect(html).toContain("重新生成");
    expect(html).toContain("左侧远景偏暗");
  });

  it("评审建议按维度中文名 / 画面位置 / 改法分开展示，不露出内部字段名", () => {
    const run = {
      ...createSucceededSceneRunFixture(),
      review: createSceneReviewFixture({
        issues: ["composition｜首屏中部偏左，正对圆门｜把这棵树移到门侧后方或缩小体量"],
      }),
    };
    const html = normalizeHtml(
      renderToString(
        <SceneRunResult state={createState("succeeded", run)} onRegenerate={noop} onRetryCapture={noop} onReload={noop} />,
      ),
    );
    expect(html).toContain("还可以继续改善");
    expect(html).toContain("空间构图");
    expect(html).toContain("首屏中部偏左，正对圆门");
    expect(html).toContain("把这棵树移到门侧后方或缩小体量");
    expect(html).not.toContain("composition");
    expect(html).not.toContain("｜");
  });

  it("失败状态展示错误码与重试入口", () => {
    const run = createSceneRunFixture({
      status: "failed",
      errorCode: "GENERATION_FAILED",
      errorMessage: "模型调用失败，已使用兜底场景",
    });
    const html = renderToString(
      <SceneRunResult state={createState("failed", run)} onRegenerate={noop} onRetryCapture={noop} onReload={noop} />,
    );
    expect(html).toContain("场景生成失败");
    expect(html).toContain("GENERATION_FAILED");
    expect(html).toContain("刷新状态");
  });

  it("等待截图阶段出错时提供「重试渲染截图」", () => {
    const run = createSceneRunFixture({ status: "awaiting_capture", code: "function build(ctx) {}" });
    const html = renderToString(
      <SceneRunResult
        state={{ status: "error", run, message: "当前浏览器不可用 WebGL（WEBGL_UNAVAILABLE）", captureAttempt: 0 }}
        onRegenerate={noop}
        onRetryCapture={noop}
        onReload={noop}
      />,
    );
    expect(html).toContain("场景操作失败");
    expect(html).toContain("重试渲染截图");
    expect(html).toContain("WEBGL_UNAVAILABLE");
  });

  it("已取消状态可重新生成", () => {
    const review = createSceneReviewFixture();
    expect(review.verdict).toBe("pass");
    const html = renderToString(
      <SceneRunResult
        state={createState("cancelled", createSceneRunFixture({ status: "cancelled" }))}
        onRegenerate={noop}
        onRetryCapture={noop}
        onReload={noop}
      />,
    );
    expect(html).toContain("已停止生成");
    expect(html).toContain("重新生成");
  });
});
