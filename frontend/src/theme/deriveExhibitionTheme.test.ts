import { describe, expect, it } from "vitest";
import { contrastRatio, rgbToOklch } from "./colorMath";
import { THEME_CONTRAST_REQUIREMENTS, deriveExhibitionTheme, themeVariables } from "./deriveExhibitionTheme";
import type { ExhibitionTheme } from "./deriveExhibitionTheme";

// 场景题面提示词里的四组示例主色（海边黄昏、雨夜街巷、室内天窗、晨光湖面）+ 默认配色本身。
const SCENE_PALETTES: readonly (readonly string[])[] = [
  ["#0B1020", "#F2A65A", "#7DD3FC", "#E8D5B7"],
  ["#22313B", "#FFC27A", "#FF5D8F", "#8FC0E0"],
  ["#2C2722", "#FFE3B8", "#9FC6DC", "#6F4F33"],
  ["#6A8FB0", "#F0D9B5", "#5F7A4A", "#8C7A62"],
  ["#3A2E26", "#8C5A3B", "#F0E4D8"],
];

// 极端输入：全白、全黑、霓虹、单色。
const EXTREME_PALETTES: readonly (readonly string[])[] = [["#FFFFFF"], ["#000000"], ["#FF00FF", "#00FF00"], ["#7DD3FC"]];

const expectReadable = (theme: ExhibitionTheme | null): void => {
  expect(theme).not.toBeNull();
  THEME_CONTRAST_REQUIREMENTS.forEach(([foreground, background, minimum]) => {
    const ratio = theme === null ? 0 : contrastRatio(theme[foreground], theme[background]);
    expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(minimum);
  });
};

describe("deriveExhibitionTheme", () => {
  it("场景示例主色都能推导出全部对比度达标的配色", () => {
    SCENE_PALETTES.forEach((palette) => expectReadable(deriveExhibitionTheme(palette)));
  });

  it("极端主色也能推导出可读配色（亮度被压回安全区间）", () => {
    EXTREME_PALETTES.forEach((palette) => expectReadable(deriveExhibitionTheme(palette)));
  });

  it("海边黄昏：中性色、深色舞台与强调色都跟随夜空的冷色调，不冒出暖色", () => {
    const theme = deriveExhibitionTheme(["#0B1020", "#F2A65A", "#7DD3FC", "#E8D5B7"]);
    const nightHue = theme === null ? 0 : rgbToOklch(theme.night).h;
    const bgHue = theme === null ? 0 : rgbToOklch(theme.bg).h;
    const accentHue = theme === null ? 0 : rgbToOklch(theme.accent).h;
    expect(nightHue).toBeGreaterThan(220);
    expect(nightHue).toBeLessThan(300);
    expect(bgHue).toBeGreaterThan(220);
    expect(accentHue).toBeGreaterThan(220);
    expect(accentHue).toBeLessThan(300);
  });

  it("基调近乎无彩时强调色借用最鲜艳主色的色相", () => {
    const theme = deriveExhibitionTheme(["#202020", "#F2A65A"]);
    const accentHue = theme === null ? 0 : rgbToOklch(theme.accent).h;
    expect(accentHue).toBeGreaterThan(40);
    expect(accentHue).toBeLessThan(80);
  });

  it("无彩的场景不给中性色凭空染色", () => {
    const theme = deriveExhibitionTheme(["#202020", "#808080"]);
    expect(theme === null ? 1 : rgbToOklch(theme.bg).c).toBeLessThan(0.002);
  });

  it("没有可解析的颜色时返回 null（退回默认配色）", () => {
    expect(deriveExhibitionTheme([])).toBeNull();
    expect(deriveExhibitionTheme(["red", "#FFF"])).toBeNull();
  });

  it("CSS 变量是空格分隔的 RGB 通道", () => {
    const theme = deriveExhibitionTheme(["#3A2E26", "#8C5A3B"]);
    const variables = theme === null ? null : themeVariables(theme);
    expect(variables?.["--color-night"]).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    expect(Object.keys(variables ?? {})).toHaveLength(8);
  });
});
