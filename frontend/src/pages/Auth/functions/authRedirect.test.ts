import { describe, expect, it } from "vitest";
import {
  currentPathWithSearch,
  DEFAULT_AUTH_REDIRECT,
  loginPathAfterSessionLoss,
  loginPathWithNext,
  registerPathWithNext,
  safeAuthRedirect,
} from "./authRedirect";

describe("登录/注册回跳路径", () => {
  it("只接受站内绝对路径，其余回退到站点首页（再按角色分流）", () => {
    expect(safeAuthRedirect("/invite/abc")).toBe("/invite/abc");
    expect(safeAuthRedirect("/contributions?x=1")).toBe("/contributions?x=1");
    expect(safeAuthRedirect(null)).toBe(DEFAULT_AUTH_REDIRECT);
    expect(safeAuthRedirect("")).toBe(DEFAULT_AUTH_REDIRECT);
    expect(safeAuthRedirect("https://evil.test")).toBe(DEFAULT_AUTH_REDIRECT);
    expect(safeAuthRedirect("//evil.test")).toBe(DEFAULT_AUTH_REDIRECT);
    expect(safeAuthRedirect("invite/abc")).toBe(DEFAULT_AUTH_REDIRECT);
  });

  it("登录/注册地址携带编码后的 next，受保护页面回跳保留 query", () => {
    expect(loginPathWithNext("/invite/a b")).toBe("/login?next=%2Finvite%2Fa%20b");
    expect(registerPathWithNext("/invite/abc")).toBe("/register?next=%2Finvite%2Fabc");
    expect(currentPathWithSearch("/contributions", "")).toBe("/contributions");
    expect(currentPathWithSearch("/exhibitions/x", "?tab=map")).toBe("/exhibitions/x?tab=map");
  });

  it("访问期间失去会话（登出）回干净登录页，从未登录才带 next", () => {
    expect(loginPathAfterSessionLoss(true, "/exhibitions/x?tab=map")).toBe("/login");
    expect(loginPathAfterSessionLoss(false, "/contributions")).toBe("/login?next=%2Fcontributions");
  });
});
