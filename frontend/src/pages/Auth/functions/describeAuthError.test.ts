import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../../../apis/shared/ApiError";
import { DecodeError } from "../../../apis/shared/decode";
import { describeAuthError } from "./describeAuthError";

const apiError = (code: ApiError["code"], reason: ApiError["reason"]): ApiError =>
  new ApiError({ status: 400, code, reason, message: "后端 message 文本" });

describe("describeAuthError", () => {
  it("按 reason 码给出友好提示", () => {
    expect(describeAuthError(apiError("CONFLICT", "USERNAME_TAKEN"))).toBe(
      "该用户名已被占用，换一个试试",
    );
    expect(describeAuthError(apiError("VALIDATION", "USERNAME_INVALID"))).toBe(
      "用户名需为 3–32 位字母、数字或下划线",
    );
    expect(describeAuthError(apiError("VALIDATION", "PASSWORD_WEAK"))).toBe("密码需为 8–72 位");
  });

  it("登录失败（401）提示凭据错误", () => {
    expect(describeAuthError(apiError("UNAUTHORIZED", null))).toBe("用户名或密码不正确");
  });

  it("网络错误、解码错误与未知错误都有兜底提示", () => {
    expect(describeAuthError(new NetworkError())).toContain("无法连接服务器");
    expect(describeAuthError(new DecodeError("auth.token"))).toContain("数据异常");
    expect(describeAuthError(new Error("boom"))).toBe("请求失败，请稍后重试");
  });
});
