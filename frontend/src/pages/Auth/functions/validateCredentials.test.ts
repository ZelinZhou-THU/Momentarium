import { describe, expect, it } from "vitest";
import { hasCredentialErrors, validateCredentials } from "./validateCredentials";

describe("validateCredentials", () => {
  it("合法用户名与密码通过", () => {
    const errors = validateCredentials({ username: "curator_01", password: "memory-2026" });
    expect(hasCredentialErrors(errors)).toBe(false);
  });

  it("用户名长度与字符集按契约校验", () => {
    expect(validateCredentials({ username: "", password: "memory-2026" }).username).toBe("请输入用户名");
    expect(validateCredentials({ username: "ab", password: "memory-2026" }).username).toBe(
      "用户名需为 3–32 位字母、数字或下划线",
    );
    expect(validateCredentials({ username: "用户一号", password: "memory-2026" }).username).toBe(
      "用户名需为 3–32 位字母、数字或下划线",
    );
    expect(validateCredentials({ username: "a".repeat(33), password: "memory-2026" }).username).toBe(
      "用户名需为 3–32 位字母、数字或下划线",
    );
  });

  it("密码长度按契约校验", () => {
    expect(validateCredentials({ username: "curator_01", password: "" }).password).toBe("请输入密码");
    expect(validateCredentials({ username: "curator_01", password: "1234567" }).password).toBe(
      "密码需为 8–72 位",
    );
    expect(validateCredentials({ username: "curator_01", password: "a".repeat(73) }).password).toBe(
      "密码需为 8–72 位",
    );
  });
});
