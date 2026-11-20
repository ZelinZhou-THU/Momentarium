import { describe, expect, it } from "vitest";
import type { ScenePanelState } from "./ScenePanelState";
import { createInitialScenePanelState, reduceScenePanel } from "../functions/reduceScenePanel";
import { createSceneRunFixture } from "../../../../../scene/mocks/sceneRunFixtures";

describe("场景状态不变量", () => {
  it("成功必须带运行数据，错误必须带信息（编译期负例）", () => {
    // @ts-expect-error succeeded requires a non-null run
    const missingRun: ScenePanelState = { status: "succeeded", run: null, message: null, captureAttempt: 0 };
    // @ts-expect-error error requires a non-null message
    const missingMessage: ScenePanelState = { status: "error", run: null, message: null, captureAttempt: 0 };
    void missingRun;
    void missingMessage;
    expect(createInitialScenePanelState(null).status).toBe("idle");
  });

  it("取消、失败或成功后迟到的截图事件不重新推进评审", () => {
    (["cancelled", "failed", "succeeded"] as const).forEach((status) => {
      const state = createInitialScenePanelState(createSceneRunFixture({ status }));
      expect(reduceScenePanel(state, { type: "capture_started" })).toBe(state);
      expect(reduceScenePanel(state, { type: "capture_completed" })).toBe(state);
      expect(reduceScenePanel(state, { type: "capture_retry" })).toBe(state);
    });
  });
});
