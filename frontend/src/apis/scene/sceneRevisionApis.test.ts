import { describe, expect, it, vi } from "vitest";
import { apiName } from "../shared/apiName";
import { AcceptSceneRunAPI } from "./AcceptSceneRunAPI";
import { ReviseSceneAPI } from "./ReviseSceneAPI";

vi.mock("../../stores/sessionStore", () => ({
  getSessionToken: (): string | null => null,
}));

describe("场景修订/采用 API（v1.14）", () => {
  it("路由名与请求字段符合契约", () => {
    expect(apiName(ReviseSceneAPI.name)).toBe("revisescene");
    expect(apiName(AcceptSceneRunAPI.name)).toBe("acceptscenerun");
    const revise = new ReviseSceneAPI("parent-run", "把灯塔调亮一点。");
    expect(revise.parentRunId).toBe("parent-run");
    expect(revise.instruction).toBe("把灯塔调亮一点。");
    expect(new AcceptSceneRunAPI("run-1").runId).toBe("run-1");
  });
});
