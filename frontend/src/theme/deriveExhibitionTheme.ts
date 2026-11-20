import type { CSSProperties } from "react";
import { contrastRatio, oklchToRgb, parseHexColor, rgbToOklch } from "./colorMath";
import type { Oklch, Rgb } from "./colorMath";

/** 界面颜色 token（与 tailwind.config.ts 的颜色同名；danger 是语义色，不随场景变化）。 */
export type ThemeToken = "bg" | "surface" | "ink" | "muted" | "line" | "accent" | "accentSoft" | "night";

/** 一套完整的展览界面配色。 */
export type ExhibitionTheme = Readonly<Record<ThemeToken, Rgb>>;

/**
 * 写到 CSS 变量上的值：空格分隔的 RGB 通道，供 `rgb(var(--color-x) / <alpha-value>)` 使用。
 * 用 type 而非 interface：对象字面量类型才能直接当作 style（CSSProperties 的 `--*` 索引签名）使用。
 */
export type ThemeVariables = {
  readonly "--color-bg": string;
  readonly "--color-surface": string;
  readonly "--color-ink": string;
  readonly "--color-muted": string;
  readonly "--color-line": string;
  readonly "--color-accent": string;
  readonly "--color-accent-soft": string;
  readonly "--color-night": string;
};

interface Shade {
  readonly l: number;
  readonly c: number;
}

// 中性色沿用默认胡桃木配色的亮度与彩度（换算到 OKLCH），只把色相换成场景的主色调：
// 明暗层次与可读性和默认配色一致，变化的只是冷暖与色调。
const NEUTRAL_SHADES: Readonly<Record<"bg" | "surface" | "line" | "ink" | "muted", Shade>> = {
  bg: { l: 0.962, c: 0.0115 },
  surface: { l: 0.994, c: 0.0057 },
  line: { l: 0.9, c: 0.018 },
  ink: { l: 0.223, c: 0.0065 },
  muted: { l: 0.521, c: 0.018 },
};

/** 场景主色彩度低于此值时视为近乎无彩，中性色按比例减弱染色，避免给灰色场景凭空加色调。 */
const TINT_FULL_CHROMA = 0.02;
/** night 的亮度区间：足够深，浅色字（含 60% 透明度）在上面仍然清楚。 */
const NIGHT_LIGHTNESS = { min: 0.22, max: 0.31 } as const;
const NIGHT_MAX_CHROMA = 0.05;
/** 强调色彩度上限：保留场景的颜色倾向，但不做霓虹色。 */
const ACCENT_MAX_CHROMA = 0.14;
const ACCENT_START_LIGHTNESS = 0.58;
const ACCENT_SOFT: Shade = { l: 0.925, c: 0.03 };

/** 界面里真实出现的前景/背景组合与最低对比度：正文 AA 4.5，主文字 7；深色舞台上的浅色字要承受透明度，要求更高。 */
export const THEME_CONTRAST_REQUIREMENTS: readonly (readonly [ThemeToken, ThemeToken, number])[] = [
  ["ink", "bg", 7],
  ["ink", "surface", 7],
  ["muted", "bg", 4.5],
  ["muted", "surface", 4.5],
  ["accent", "bg", 4.5],
  ["accent", "surface", 4.5],
  ["accent", "accentSoft", 4.5],
  ["surface", "night", 10],
  ["accentSoft", "night", 7],
];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const neutral = (shade: Shade, hue: number, tint: number): Rgb => oklchToRgb({ l: shade.l, c: shade.c * tint, h: hue });

/** 从起始亮度向下找第一个与 accentSoft 达到 4.5:1 的强调色；找不到返回 null。 */
const readableAccent = (vivid: Oklch, accentSoft: Rgb): Rgb | null => {
  const chroma = Math.min(vivid.c, ACCENT_MAX_CHROMA);
  const start = Math.min(vivid.l, ACCENT_START_LIGHTNESS);
  return (
    Array.from({ length: 30 }, (_, step) => oklchToRgb({ l: start - step * 0.01, c: chroma, h: vivid.h })).find(
      (accent) => contrastRatio(accent, accentSoft) >= 4.5,
    ) ?? null
  );
};

const meetsContrast = (theme: ExhibitionTheme): boolean =>
  THEME_CONTRAST_REQUIREMENTS.every(([foreground, background, minimum]) => contrastRatio(theme[foreground], theme[background]) >= minimum);

/**
 * 场景题面主色 → 展览界面配色（纯函数）。
 * - night：最深的主色，亮度压到深色舞台区间、彩度封顶；
 * - 中性色（bg/surface/line/ink/muted）：默认配色的明暗，染上 night 的色相；
 * - accent：取场景基调的色相（night 的色相）、最鲜艳主色的彩度，降亮度直到在浅底上可读；
 *   这样按钮、链接、徽标与整个界面同色系，不会在冷色场景里冒出一个暖色的"胡桃木"；
 *   accentSoft 是它的浅色版本。基调近乎无彩（灰色场景）时才借用最鲜艳主色的色相。
 * 没有可解析的颜色、或任何一组对比度不达标时返回 null，界面整体退回默认胡桃木配色。
 */
export const deriveExhibitionTheme = (palette: readonly string[]): ExhibitionTheme | null => {
  const colors = palette.flatMap((hex) => {
    const rgb = parseHexColor(hex);
    return rgb === null ? [] : [rgbToOklch(rgb)];
  });
  const darkest = colors.reduce<Oklch | null>((best, color) => (best === null || color.l < best.l ? color : best), null);
  const vivid = colors.reduce<Oklch | null>((best, color) => (best === null || color.c > best.c ? color : best), null);
  if (darkest === null || vivid === null) return null;

  const tint = Math.min(1, darkest.c / TINT_FULL_CHROMA);
  const accentHue = tint === 1 ? darkest.h : vivid.h;
  const accentSoft = oklchToRgb({ l: ACCENT_SOFT.l, c: Math.min(vivid.c, ACCENT_SOFT.c), h: accentHue });
  const accent = readableAccent({ ...vivid, h: accentHue }, accentSoft);
  if (accent === null) return null;

  const theme: ExhibitionTheme = {
    bg: neutral(NEUTRAL_SHADES.bg, darkest.h, tint),
    surface: neutral(NEUTRAL_SHADES.surface, darkest.h, tint),
    line: neutral(NEUTRAL_SHADES.line, darkest.h, tint),
    ink: neutral(NEUTRAL_SHADES.ink, darkest.h, tint),
    muted: neutral(NEUTRAL_SHADES.muted, darkest.h, tint),
    accent,
    accentSoft,
    night: oklchToRgb({
      l: clamp(darkest.l, NIGHT_LIGHTNESS.min, NIGHT_LIGHTNESS.max),
      c: Math.min(darkest.c, NIGHT_MAX_CHROMA),
      h: darkest.h,
    }),
  };
  return meetsContrast(theme) ? theme : null;
};

const channels = ({ r, g, b }: Rgb): string => `${r} ${g} ${b}`;

export const themeVariables = (theme: ExhibitionTheme): ThemeVariables => ({
  "--color-bg": channels(theme.bg),
  "--color-surface": channels(theme.surface),
  "--color-ink": channels(theme.ink),
  "--color-muted": channels(theme.muted),
  "--color-line": channels(theme.line),
  "--color-accent": channels(theme.accent),
  "--color-accent-soft": channels(theme.accentSoft),
  "--color-night": channels(theme.night),
});

/**
 * 局部配色：把某个展览的配色写成 CSS 变量，套在卡片等元素上，元素内的 accent / accentSoft 等类就跟随该展览。
 * 推导不出可读配色时为 undefined，沿用所在页面的配色。
 */
export const exhibitionThemeStyle = (palette: readonly string[]): CSSProperties | undefined => {
  const theme = deriveExhibitionTheme(palette);
  return theme === null ? undefined : themeVariables(theme);
};
