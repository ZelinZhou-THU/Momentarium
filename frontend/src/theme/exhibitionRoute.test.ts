import { describe, expect, it } from "vitest";
import { exhibitionIdOfPath } from "./exhibitionRoute";

describe("exhibitionIdOfPath", () => {
  it("工作台、子页与公开看展页都属于该展览", () => {
    expect(exhibitionIdOfPath("/exhibitions/ex-1")).toBe("ex-1");
    expect(exhibitionIdOfPath("/exhibitions/ex-1/scenes")).toBe("ex-1");
    expect(exhibitionIdOfPath("/exhibitions/ex-1/insights")).toBe("ex-1");
    expect(exhibitionIdOfPath("/exhibitions/ex-1/view")).toBe("ex-1");
    expect(exhibitionIdOfPath("/show/ex-1")).toBe("ex-1");
  });

  it("列表、账户与作者主页不属于单个展览", () => {
    expect(exhibitionIdOfPath("/exhibitions")).toBeNull();
    expect(exhibitionIdOfPath("/account")).toBeNull();
    expect(exhibitionIdOfPath("/u/memory_curator")).toBeNull();
    expect(exhibitionIdOfPath("/login")).toBeNull();
  });
});
