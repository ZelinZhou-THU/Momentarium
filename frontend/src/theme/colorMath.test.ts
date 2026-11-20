import { describe, expect, it } from "vitest";
import { contrastRatio, formatHexColor, oklchToRgb, parseHexColor, rgbToOklch } from "./colorMath";

describe("colorMath", () => {
  it("只解析 #RRGGBB，大小写不敏感，其它写法返回 null", () => {
    expect(parseHexColor("#8c5a3B")).toEqual({ r: 140, g: 90, b: 59 });
    expect(parseHexColor("#FFF")).toBeNull();
    expect(parseHexColor("red")).toBeNull();
    expect(formatHexColor({ r: 140, g: 90, b: 59 })).toBe("#8C5A3B");
  });

  it("sRGB → OKLCH → sRGB 往返不丢精度", () => {
    ["#3A2E26", "#0B1020", "#F2A65A", "#7DD3FC", "#FFFFFF", "#000000"].forEach((hex) => {
      const rgb = parseHexColor(hex);
      expect(rgb).not.toBeNull();
      expect(formatHexColor(oklchToRgb(rgbToOklch(rgb ?? { r: 0, g: 0, b: 0 })))).toBe(hex);
    });
  });

  it("超出 sRGB 色域的颜色只降彩度，结果仍是合法颜色", () => {
    const rgb = oklchToRgb({ l: 0.6, c: 0.4, h: 145 });
    [rgb.r, rgb.g, rgb.b].forEach((channel) => {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    });
    expect(rgbToOklch(rgb).l).toBeCloseTo(0.6, 2);
  });

  it("WCAG 对比度：黑白 21:1，与参数顺序无关", () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });
});
