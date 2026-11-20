import { describe, expect, it } from "vitest";
import { ApiError } from "../../../apis/shared/ApiError";
import { describeAccountError } from "./describeAccountError";

describe("describeAccountError", () => {
  it("把账户相关 reason 转成中文", () => {
    const error = new ApiError({ status: 400, code: "VALIDATION", reason: "PASSWORD_INCORRECT", message: "当前密码不正确" });
    expect(describeAccountError(error)).toBe("当前密码不正确。");
  });

  it("未知错误给出通用文案", () => {
    expect(describeAccountError(new Error("boom"))).toMatch(/稍后重试/);
  });
});
