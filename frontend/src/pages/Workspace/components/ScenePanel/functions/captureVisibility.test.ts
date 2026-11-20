import { describe, expect, it } from "vitest";
import {
  canStartCapture,
  captureStartKey,
  isCaptureStatus,
  MAX_FRAME_STARVED_RETRIES,
  shouldDeferCapture,
  shouldRetryFrameStarvedCapture,
} from "./captureVisibility";

describe("帧率采样不足的自动重截", () => {
  it("fps 为空或 0 且未超过次数上限才重截，正常帧率或超限后照常提交", () => {
    expect(shouldRetryFrameStarvedCapture(null, 0)).toBe(true);
    expect(shouldRetryFrameStarvedCapture(0, 1)).toBe(true);
    expect(shouldRetryFrameStarvedCapture(0, MAX_FRAME_STARVED_RETRIES)).toBe(false);
    expect(shouldRetryFrameStarvedCapture(null, MAX_FRAME_STARVED_RETRIES)).toBe(false);
    expect(shouldRetryFrameStarvedCapture(30, 0)).toBe(false);
    expect(shouldRetryFrameStarvedCapture(12, 0)).toBe(false);
  });
});

describe("ScenePanel 截图可见性门控", () => {
  it("仅 awaiting_capture 属于截图阶段", () => {
    expect(isCaptureStatus("awaiting_capture")).toBe(true);
    expect(isCaptureStatus("generating")).toBe(false);
    expect(isCaptureStatus("capturing")).toBe(false);
    expect(isCaptureStatus("succeeded")).toBe(false);
  });

  it("离屏（面板不可见/页面隐藏）时暂缓截图与 reviewscene", () => {
    expect(shouldDeferCapture("awaiting_capture", false, true)).toBe(true);
    expect(shouldDeferCapture("awaiting_capture", true, false)).toBe(true);
    expect(shouldDeferCapture("awaiting_capture", true, true)).toBe(false);
    // 非截图阶段不涉及门控
    expect(shouldDeferCapture("generating", false, true)).toBe(false);
    expect(shouldDeferCapture("succeeded", false, false)).toBe(false);
  });

  it("可见后仍需等帧（captureArmed）才能开始截图", () => {
    expect(canStartCapture("awaiting_capture", true, true, true)).toBe(true);
    expect(canStartCapture("awaiting_capture", false, true, true)).toBe(false);
    expect(canStartCapture("awaiting_capture", true, false, true)).toBe(false);
    expect(canStartCapture("awaiting_capture", true, true, false)).toBe(false);
    expect(canStartCapture("succeeded", true, true, true)).toBe(false);
  });

  it("截图轮次键包含 runId/attempts/captureAttempt：revise 或重试都会产生新键", () => {
    const key = captureStartKey({ runId: "run-1", attempts: 0 }, 0);
    expect(key).toBe("run-1:0:0");
    expect(captureStartKey({ runId: "run-1", attempts: 1 }, 0)).not.toBe(key);
    expect(captureStartKey({ runId: "run-1", attempts: 0 }, 1)).not.toBe(key);
  });
});
