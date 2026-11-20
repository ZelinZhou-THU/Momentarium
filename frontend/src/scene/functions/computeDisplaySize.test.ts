import { describe, expect, it } from "vitest";
import { DISPLAY_MAX_EDGE } from "../contract";
import { computeDisplaySize } from "./computeDisplaySize";

describe("展示图尺寸计算（spec §9.4 长边 ≤2048）", () => {
  it("大图按长边等比缩到 2048", () => {
    expect(computeDisplaySize(4000, 3000)).toEqual({ width: 2048, height: 1536 });
    expect(computeDisplaySize(3000, 4000)).toEqual({ width: 1536, height: 2048 });
    expect(computeDisplaySize(2400, 1600)).toEqual({ width: 2048, height: 1365 });
  });

  it("小图不放大（只缩小）", () => {
    expect(computeDisplaySize(1000, 800)).toEqual({ width: 1000, height: 800 });
    expect(computeDisplaySize(2048, 1365)).toEqual({ width: 2048, height: 1365 });
  });

  it("极端宽高比也保持长边上限且不出现 0 像素", () => {
    const wide = computeDisplaySize(8000, 1);
    expect(wide.width).toBe(DISPLAY_MAX_EDGE);
    expect(wide.height).toBe(1);
  });

  it("非法尺寸直接抛错（由调用方转错误态）", () => {
    expect(() => computeDisplaySize(0, 100)).toThrow();
    expect(() => computeDisplaySize(-1, 100)).toThrow();
    expect(() => computeDisplaySize(100, Number.NaN)).toThrow();
  });
});
