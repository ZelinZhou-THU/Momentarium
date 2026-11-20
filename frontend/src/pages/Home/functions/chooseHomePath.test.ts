import { describe, expect, it } from "vitest";
import { chooseHomePath } from "./chooseHomePath";

describe("chooseHomePath 首页落点", () => {
  it("有自己的展览：回我的展览（无论是否也参与了别人的）", () => {
    expect(chooseHomePath(2, 0)).toBe("/exhibitions");
    expect(chooseHomePath(1, 3)).toBe("/exhibitions");
  });

  it("没有自己的展览但有参与记录：去我参与的", () => {
    expect(chooseHomePath(0, 1)).toBe("/contributions");
  });

  it("两者都没有：保持我的展览（空馆引导新建）", () => {
    expect(chooseHomePath(0, 0)).toBe("/exhibitions");
  });
});
