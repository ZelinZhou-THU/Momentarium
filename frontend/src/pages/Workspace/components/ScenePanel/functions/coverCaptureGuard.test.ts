import { describe, expect, it } from "vitest";
import { canRequestSceneCover, matchesCoverRequest } from "./coverCaptureGuard";

describe("封面操作竞态", () => {
  it("生成请求期间禁用旧运行封面", () => {
    expect(canRequestSceneCover(true, false, true)).toBe(false);
    expect(canRequestSceneCover(true, false, false)).toBe(true);
  });
  it("只接受当前截图请求的错误，忽略超时后旧请求的错误", () => {
    const pending = { requestId: "new" };
    expect(matchesCoverRequest(pending, "old")).toBe(false);
    expect(matchesCoverRequest(pending, undefined)).toBe(false);
    expect(matchesCoverRequest(pending, "new")).toBe(true);
  });
});
