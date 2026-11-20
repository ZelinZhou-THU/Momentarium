import { describe, expect, it } from "vitest";
import { hasPasswordErrors, validatePasswordChange } from "./validatePasswordChange";

describe("validatePasswordChange", () => {
  it("当前密码必填；新密码 8–72 字符；两次输入一致", () => {
    expect(validatePasswordChange({ currentPassword: "", newPassword: "short", confirmPassword: "other" })).toEqual({
      currentPassword: "请输入当前密码",
      newPassword: "新密码需为 8–72 个字符",
      confirmPassword: "两次输入的新密码不一致",
    });
  });

  it("新密码不能与当前密码相同", () => {
    const errors = validatePasswordChange({
      currentPassword: "SamePassw0rd",
      newPassword: "SamePassw0rd",
      confirmPassword: "SamePassw0rd",
    });
    expect(errors.newPassword).toBe("新密码不能与当前密码相同");
  });

  it("合法输入没有错误", () => {
    const errors = validatePasswordChange({
      currentPassword: "OldPassw0rd",
      newPassword: "NewPassw0rd!",
      confirmPassword: "NewPassw0rd!",
    });
    expect(hasPasswordErrors(errors)).toBe(false);
  });
});
