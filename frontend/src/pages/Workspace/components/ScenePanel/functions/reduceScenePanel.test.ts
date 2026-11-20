import { describe, expect, it } from "vitest";
import {
  canSubmitCapture,
  captureSubmitKey,
  createInitialScenePanelState,
  isActiveStatus,
  isPollingStatus,
  reduceScenePanel,
  runChangeKey,
  scenePreparationTarget,
  shouldAutoCaptureSandbox,
} from "./reduceScenePanel";
import type { ScenePanelEvent, ScenePanelState, ScenePanelStatus } from "../objects/ScenePanelState";
import { describeSceneStage } from "./describeSceneStage";
import { createSceneReviewFixture, createSceneRunFixture } from "../../../../../scene/mocks/sceneRunFixtures";

const apply = (state: ScenePanelState, ...events: ScenePanelEvent[]): ScenePanelState =>
  events.reduce(reduceScenePanel, state);

const createRun = createSceneRunFixture;

describe("ScenePanel 状态机", () => {
  it("initialRun 决定初始状态：undefined=loading、null=idle、run=其状态", () => {
    expect(createInitialScenePanelState(undefined).status).toBe("loading");
    expect(createInitialScenePanelState(null).status).toBe("idle");
    expect(createInitialScenePanelState(createRun({ status: "queued" })).status).toBe("queued");
    expect(createInitialScenePanelState(createRun({ status: "succeeded" })).status).toBe("succeeded");
  });

  it("loading → queued → generating → awaiting_capture（轮询推进）", () => {
    const loaded = createInitialScenePanelState(undefined);
    const queued = apply(loaded, { type: "run_loaded", run: createRun({ status: "queued" }) });
    expect(queued.status).toBe("queued");
    const generating = apply(queued, { type: "run_updated", run: createRun({ status: "generating" }) });
    expect(generating.status).toBe("generating");
    const awaiting = apply(generating, {
      type: "run_updated",
      run: createRun({ status: "awaiting_capture", code: "function build(ctx) {}" }),
    });
    expect(awaiting.status).toBe("awaiting_capture");
    expect(awaiting.run?.code).toBe("function build(ctx) {}");
  });

  it("awaiting_capture → capturing → reviewing → succeeded 的本地渲染/评审流程", () => {
    const awaiting = apply(createInitialScenePanelState(null), {
      type: "run_loaded",
      run: createRun({ status: "awaiting_capture", code: "function build(ctx) {}" }),
    });
    const capturing = reduceScenePanel(awaiting, { type: "capture_started" });
    expect(capturing.status).toBe("capturing");
    expect(reduceScenePanel(capturing, { type: "capture_started" })).toBe(capturing);

    const reviewing = reduceScenePanel(capturing, { type: "capture_completed" });
    expect(reviewing.status).toBe("reviewing");

    const succeeded = reduceScenePanel(reviewing, {
      type: "run_updated",
      run: createRun({ status: "succeeded", review: createSceneReviewFixture() }),
    });
    expect(succeeded.status).toBe("succeeded");
    expect(succeeded.run?.review?.verdict).toBe("pass");
  });

  it("截图失败可重试：error → capture_retry 回到 awaiting_capture 并重建沙箱", () => {
    const awaiting = apply(createInitialScenePanelState(null), {
      type: "run_loaded",
      run: createRun({ status: "awaiting_capture", code: "function build(ctx) {}" }),
    });
    const failed = reduceScenePanel(awaiting, {
      type: "run_failed",
      message: "当前浏览器不可用 WebGL（WEBGL_UNAVAILABLE）",
    });
    expect(failed.status).toBe("error");
    expect(failed.run?.runId).toBe(awaiting.run?.runId);

    const retried = reduceScenePanel(failed, { type: "capture_retry" });
    expect(retried.status).toBe("awaiting_capture");
    expect(retried.captureAttempt).toBe(1);
    expect(retried.message).toBeNull();
  });

  it("failed / cancelled / reviewing 由 run_updated 映射", () => {
    const idle = createInitialScenePanelState(null);
    expect(
      reduceScenePanel(idle, { type: "run_updated", run: createRun({ status: "failed", errorCode: "GENERATION_FAILED" }) })
        .status,
    ).toBe("failed");
    expect(reduceScenePanel(idle, { type: "run_updated", run: createRun({ status: "cancelled" }) }).status).toBe(
      "cancelled",
    );
    expect(reduceScenePanel(idle, { type: "run_updated", run: createRun({ status: "reviewing" }) }).status).toBe(
      "reviewing",
    );
  });

  it("请求错误进入 error 并保留当前 run；reset 回到运行状态", () => {
    const running = apply(createInitialScenePanelState(null), {
      type: "run_loaded",
      run: createRun({ status: "generating" }),
    });
    const errored = reduceScenePanel(running, { type: "run_failed", message: "无法连接服务器" });
    expect(errored.status).toBe("error");
    expect(errored.message).toBe("无法连接服务器");
    expect(errored.run?.status).toBe("generating");

    const reset = reduceScenePanel(errored, { type: "reset", run: createRun({ status: "queued" }) });
    expect(reset.status).toBe("queued");
    expect(reset.message).toBeNull();
    expect(reset.captureAttempt).toBe(0);
  });

  it("覆盖验收要求的全部状态：loading/queued/generating/awaiting_capture/reviewing/succeeded/failed/cancelled", () => {
    const reached = new Set<ScenePanelStatus>();
    const record = (state: ScenePanelState): ScenePanelState => {
      reached.add(state.status);
      return state;
    };
    let state = record(createInitialScenePanelState(undefined));
    state = record(reduceScenePanel(state, { type: "run_updated", run: createRun({ status: "queued" }) }));
    state = record(reduceScenePanel(state, { type: "run_updated", run: createRun({ status: "generating" }) }));
    state = record(reduceScenePanel(state, { type: "run_updated", run: createRun({ status: "awaiting_capture" }) }));
    state = record(reduceScenePanel(state, { type: "capture_started" }));
    state = record(reduceScenePanel(state, { type: "capture_completed" }));
    expect(reached.has("reviewing")).toBe(true);
    state = record(reduceScenePanel(state, { type: "run_updated", run: createRun({ status: "succeeded" }) }));
    state = record(reduceScenePanel(state, { type: "run_updated", run: createRun({ status: "failed" }) }));
    state = record(reduceScenePanel(state, { type: "run_updated", run: createRun({ status: "cancelled" }) }));
    state = record(reduceScenePanel(state, { type: "run_failed", message: "x" }));
    expect(reached.has("error")).toBe(true);
    expect(reached.has("capturing")).toBe(true);
    const expected: ScenePanelStatus[] = [
      "loading",
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
    for (const status of expected) expect(reached.has(status)).toBe(true);
  });

  it("revise 后再次 awaiting_capture（attempts+1）会重建沙箱并重新截图", () => {
    const awaiting = apply(createInitialScenePanelState(null), {
      type: "run_loaded",
      run: createRun({ status: "awaiting_capture", attempts: 0, code: "v1" }),
    });
    const capturing = reduceScenePanel(awaiting, { type: "capture_started" });
    const reviewing = reduceScenePanel(capturing, { type: "capture_completed" });
    const regenerating = reduceScenePanel(reviewing, {
      type: "run_updated",
      run: createRun({ status: "generating", attempts: 1 }),
    });
    expect(regenerating.status).toBe("generating");

    const awaitingAgain = reduceScenePanel(regenerating, {
      type: "run_updated",
      run: createRun({ status: "awaiting_capture", attempts: 1, code: "v2" }),
    });
    expect(awaitingAgain.status).toBe("awaiting_capture");
    expect(awaitingAgain.captureAttempt).toBe(awaiting.captureAttempt + 1);
    expect(awaitingAgain.run?.code).toBe("v2");
  });

  it("同一 awaiting_capture（attempts 不变）重复同步不会重建沙箱", () => {
    const awaiting = apply(createInitialScenePanelState(null), {
      type: "run_loaded",
      run: createRun({ status: "awaiting_capture", attempts: 0, code: "v1" }),
    });
    const again = reduceScenePanel(awaiting, {
      type: "run_updated",
      run: createRun({ status: "awaiting_capture", attempts: 0, code: "v1" }),
    });
    expect(again.captureAttempt).toBe(awaiting.captureAttempt);
  });

  it("revise 后即使 attempts 未变、仅 updatedAt/code 变化也会重建沙箱并重新截图", () => {
    const awaiting = apply(createInitialScenePanelState(null), {
      type: "run_loaded",
      run: createRun({ status: "awaiting_capture", attempts: 0, code: "v1", updatedAt: "2026-10-27T12:00:00Z" }),
    });
    const reviewing = reduceScenePanel(awaiting, { type: "capture_completed" });
    const revised = reduceScenePanel(reviewing, {
      type: "run_updated",
      run: createRun({ status: "awaiting_capture", attempts: 0, code: "v2", updatedAt: "2026-10-27T12:00:05Z" }),
    });
    expect(revised.captureAttempt).toBe(awaiting.captureAttempt + 1);
  });

  it("评审提交守卫：仅 capturing 态允许提交，同一 attempts 只提交一次", () => {
    const run = createRun({ status: "awaiting_capture", attempts: 1 });
    expect(canSubmitCapture("capturing", true)).toBe(true);
    expect(canSubmitCapture("awaiting_capture", true)).toBe(true);
    expect(canSubmitCapture("capturing", false)).toBe(false);
    expect(canSubmitCapture("awaiting_capture", false)).toBe(false);
    expect(canSubmitCapture("reviewing", true)).toBe(false);
    expect(canSubmitCapture("succeeded", true)).toBe(false);
    expect(canSubmitCapture("error", false)).toBe(false);
    expect(captureSubmitKey(run)).toBe(`${run.runId}:1:${run.updatedAt}`);
    // 构建修复不增加 attempts，但必须算新的一轮，否则修复版的评审提交会被去重丢掉
    expect(captureSubmitKey({ ...run, updatedAt: `${run.updatedAt}+repair` })).not.toBe(captureSubmitKey(run));
  });

  it("autoCapture：succeeded 的实时预览不得再次截图/回传评审", () => {
    expect(shouldAutoCaptureSandbox("succeeded")).toBe(false);
    expect(shouldAutoCaptureSandbox("awaiting_capture")).toBe(true);
    expect(shouldAutoCaptureSandbox("capturing")).toBe(true);
    expect(shouldAutoCaptureSandbox("reviewing")).toBe(true);
    expect(shouldAutoCaptureSandbox("error")).toBe(false);
    expect(shouldAutoCaptureSandbox("generating")).toBe(false);
    expect(shouldAutoCaptureSandbox("failed")).toBe(false);
  });

  it("runChangeKey：去重键随状态推进变化（每次变化通知页面静默刷新一次）", () => {
    const generating = createRun({ status: "generating", attempts: 0, updatedAt: "2026-10-27T12:00:00Z" });
    const awaiting = createRun({ status: "awaiting_capture", attempts: 0, updatedAt: "2026-10-27T12:00:01Z" });
    const succeeded = createRun({ status: "succeeded", attempts: 1, updatedAt: "2026-10-27T12:00:02Z" });

    expect(runChangeKey(generating)).not.toBe(runChangeKey(awaiting));
    expect(runChangeKey(awaiting)).not.toBe(runChangeKey(succeeded));
    expect(runChangeKey(generating)).toBe(runChangeKey({ ...generating }));
  });

  it("轮询/可取消状态判定", () => {
    expect(isPollingStatus("queued")).toBe(true);
    expect(isPollingStatus("generating")).toBe(true);
    expect(isPollingStatus("reviewing")).toBe(true);
    expect(isPollingStatus("awaiting_capture")).toBe(false);
    expect(isPollingStatus("succeeded")).toBe(false);
    expect(isActiveStatus("awaiting_capture")).toBe(true);
    expect(isActiveStatus("succeeded")).toBe(false);
    expect(isActiveStatus("cancelled")).toBe(false);
  });
});

describe("scenePreparationTarget（沙箱展示图准备目标，UI-03）", () => {
  const code = "function build(ctx) {}";

  it("沙箱阶段（含截图推进与成功预览）用最新运行", () => {
    const awaiting = apply(createInitialScenePanelState(null), {
      type: "run_loaded",
      run: createRun({ status: "awaiting_capture", code }),
    });
    const capturing = reduceScenePanel(awaiting, { type: "capture_started" });
    const reviewing = reduceScenePanel(capturing, { type: "capture_completed" });
    const succeeded = reduceScenePanel(reviewing, {
      type: "run_updated",
      run: createRun({ status: "succeeded", code }),
    });
    for (const state of [awaiting, capturing, reviewing, succeeded]) {
      expect(scenePreparationTarget(state, null)?.code).toBe(code);
    }
  });

  it("最新运行已取消且无已采用场景：返回 null（调用方据此清掉“正在准备沙箱展示图”）", () => {
    const cancelled = reduceScenePanel(createInitialScenePanelState(null), {
      type: "run_updated",
      run: createRun({ status: "cancelled", code }),
    });
    expect(scenePreparationTarget(cancelled, null)).toBeNull();
    expect(scenePreparationTarget(cancelled, undefined)).toBeNull();
  });

  it("最新运行已取消但有已采用的当前场景：退回当前场景预览", () => {
    const cancelled = reduceScenePanel(createInitialScenePanelState(null), {
      type: "run_updated",
      run: createRun({ status: "cancelled", code }),
    });
    const currentRun = createRun({ status: "succeeded", code, isCurrent: true, runId: "33333333-3333-4333-8333-333333333333" });
    expect(scenePreparationTarget(cancelled, currentRun)?.runId).toBe(currentRun.runId);
  });

  it("当前场景未成功或无代码不可作为回退目标", () => {
    const cancelled = reduceScenePanel(createInitialScenePanelState(null), {
      type: "run_updated",
      run: createRun({ status: "cancelled", code }),
    });
    expect(scenePreparationTarget(cancelled, createRun({ status: "failed", code }))).toBeNull();
    expect(scenePreparationTarget(cancelled, createRun({ status: "succeeded", code: null }))).toBeNull();
  });
});

describe("阶段文案", () => {
  it("每个状态都有非空标题与说明", () => {
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
      const runState = createInitialScenePanelState(createRun({ status: status === "capturing" ? "awaiting_capture" : status === "error" || status === "loading" || status === "idle" ? "queued" : status }));
      const state = status === "loading" ? createInitialScenePanelState(undefined)
        : status === "idle" ? createInitialScenePanelState(null)
        : status === "error" ? reduceScenePanel(runState, { type: "run_failed", message: "请求失败" })
        : status === "capturing" ? reduceScenePanel(runState, { type: "capture_started" }) : runState;
      const stage = describeSceneStage(state);
      expect(stage.title.length).toBeGreaterThan(0);
      expect(stage.description.length).toBeGreaterThan(0);
    }
  });

  it("generating 阶段按 brief 是否已生成区分题面/代码文案", () => {
    const withoutBrief = describeSceneStage({
      status: "generating",
      run: createRun({ status: "generating", brief: null }),
      message: null,
      captureAttempt: 0,
    });
    expect(withoutBrief.title).toContain("题面");
    const withBrief = describeSceneStage({
      status: "generating",
      run: createRun({ status: "generating", brief: createSceneReviewFixtureLikeBrief() }),
      message: null,
      captureAttempt: 0,
    });
    expect(withBrief.title).toContain("代码");
  });
});

const createSceneReviewFixtureLikeBrief = () => ({
  mood: "m",
  memoryReading: "r",
  scenePrompt: "p",
  entranceNarration: "e",
  palette: ["#000000"],
  avoid: [],
  userHint: null,
});
