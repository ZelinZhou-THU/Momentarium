import { describe, expect, it } from "vitest";
import { isCodeFailure, toCodeFailureEvidence } from "./toCodeFailureEvidence";

describe("沙箱失败 → 评审证据", () => {
  it("代码导致的失败（编译/build 抛错/超时）转成只有 errors 的证据，交给评审回灌修复", () => {
    expect(toCodeFailureEvidence("BUILD_FAILED", "build", "x is not defined（第 12 行：x.add(y)）")).toEqual({
      buildMs: 0,
      fps: 0,
      errors: ["build: BUILD_FAILED: x is not defined（第 12 行：x.add(y)）"],
      photoIdsUsed: [],
      networkAttempts: 0,
    });
    expect(isCodeFailure("CODE_INVALID")).toBe(true);
    expect(isCodeFailure("BUILD_TIMEOUT")).toBe(true);
  });

  it("环境失败（WebGL、资源、截图超时）不进修复，留给用户重试", () => {
    expect(toCodeFailureEvidence("WEBGL_UNAVAILABLE", "init", "no webgl")).toBeNull();
    expect(toCodeFailureEvidence("RESOURCE_LOAD_FAILED", "resources", "404")).toBeNull();
    expect(toCodeFailureEvidence("CAPTURE_TIMEOUT", "capture", "timeout")).toBeNull();
  });
});
