import { describe, expect, it } from "vitest";
import { ApiError, NetworkError, parseApiError } from "./ApiError";

describe("parseApiError", () => {
  it("解析契约错误结构与 details.reason", () => {
    const error = parseApiError(409, {
      error: {
        code: "CONFLICT",
        message: "用户名已被占用",
        details: { reason: "USERNAME_TAKEN" },
      },
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("CONFLICT");
    expect(error.reason).toBe("USERNAME_TAKEN");
    expect(error.status).toBe(409);
    expect(error.message).toBe("用户名已被占用");
  });

  it("未知 code 退化为 INTERNAL，缺失 reason 时为 null", () => {
    const error = parseApiError(500, {
      error: { code: "SOMETHING_NEW", message: "意外错误" },
    });

    expect(error.code).toBe("INTERNAL");
    expect(error.reason).toBeNull();
    expect(error.message).toBe("意外错误");
  });

  it("错误体不是契约结构时仍返回可处理的 ApiError", () => {
    const error = parseApiError(502, "<html>bad gateway</html>");

    expect(error.code).toBe("INTERNAL");
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("位置与地点搜索的新错误码/ reason 按键值解析（不匹配 message）", () => {
    const upstream = parseApiError(503, {
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "服务暂不可用",
        details: { reason: "PLACE_SEARCH_UNAVAILABLE" },
      },
    });
    expect(upstream.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(upstream.reason).toBe("PLACE_SEARCH_UNAVAILABLE");
    expect(upstream.status).toBe(503);

    const invalidName = parseApiError(400, {
      error: { code: "VALIDATION", message: "bad", details: { reason: "LOCATION_NAME_INVALID" } },
    });
    expect(invalidName.reason).toBe("LOCATION_NAME_INVALID");

    const invalidCoordinates = parseApiError(400, {
      error: {
        code: "VALIDATION",
        message: "bad",
        details: { reason: "LOCATION_COORDINATES_INVALID" },
      },
    });
    expect(invalidCoordinates.reason).toBe("LOCATION_COORDINATES_INVALID");

    const invalidGranularity = parseApiError(400, {
      error: {
        code: "VALIDATION",
        message: "bad",
        details: { reason: "LOCATION_GRANULARITY_INVALID" },
      },
    });
    expect(invalidGranularity.reason).toBe("LOCATION_GRANULARITY_INVALID");

    const invalidQuery = parseApiError(400, {
      error: { code: "VALIDATION", message: "bad", details: { reason: "PLACE_QUERY_INVALID" } },
    });
    expect(invalidQuery.reason).toBe("PLACE_QUERY_INVALID");
  });

  it("阶段 4 场景修订 reason 全部参与解析（不被白名单吞掉）", () => {
    const cases = [
      [400, "VALIDATION", "SCENE_INSTRUCTION_INVALID"],
      [400, "VALIDATION", "SCENE_REVISION_TOO_LARGE"],
      [409, "CONFLICT", "SCENE_REVISION_STALE"],
      [409, "CONFLICT", "SCENE_RUN_NOT_ACCEPTABLE"],
    ] as const;

    cases.forEach(([status, code, reason]) => {
      const error = parseApiError(status, {
        error: { code, message: "bad", details: { reason } },
      });
      expect(error.reason).toBe(reason);
    });
  });
});

describe("NetworkError", () => {
  it("自带面向用户的中文提示", () => {
    expect(new NetworkError().message).toContain("无法连接服务器");
  });
});
