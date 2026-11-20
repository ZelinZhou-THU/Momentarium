import { describe, expect, it, vi } from "vitest";
import { reportCaptureStartOnce } from "./reportCaptureStartOnce";

describe("截图开始通知", () => {
  it("关闭自动截图不记录；回调变化不重复通知，新轮次和运行可再次通知", () => {
    const last = { current: new Set<string>() };
    const first = vi.fn();
    const next = vi.fn();
    reportCaptureStartOnce(last, false, "run", 0, first);
    expect(last.current.size).toBe(0);
    reportCaptureStartOnce(last, true, "run", 0, first);
    reportCaptureStartOnce(last, true, "run", 0, next);
    expect(first).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    reportCaptureStartOnce(last, true, "run", 1, next);
    reportCaptureStartOnce(last, true, "another", 1, next);
    reportCaptureStartOnce(last, true, "run", 0, next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
