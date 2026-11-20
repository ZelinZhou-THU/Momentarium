import { afterEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_TIMEOUT_MS, scheduleCaptureTimeout } from "./captureTimeout";

describe("截图等待超时", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("无回调时超时，完成或离屏时取消计时", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    const timeout = vi.fn();
    const cancel = scheduleCaptureTimeout(timeout);
    vi.advanceTimersByTime(CAPTURE_TIMEOUT_MS - 1);
    expect(timeout).not.toHaveBeenCalled();
    cancel();
    vi.advanceTimersByTime(1);
    expect(timeout).not.toHaveBeenCalled();
    scheduleCaptureTimeout(timeout);
    vi.advanceTimersByTime(CAPTURE_TIMEOUT_MS);
    expect(timeout).toHaveBeenCalledOnce();
  });
});
