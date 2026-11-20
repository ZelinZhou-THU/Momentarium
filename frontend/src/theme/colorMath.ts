/**
 * 颜色换算的纯函数：#RRGGBB ↔ sRGB ↔ OKLCH，以及 WCAG 对比度。
 * 推导界面配色时在 OKLCH 里调亮度/彩度——它是感知均匀的，只改亮度不会让色相漂移。
 * 公式来自 Björn Ottosson 的 OKLab 定义与 WCAG 2.x 相对亮度定义。
 */

/** sRGB 颜色，各通道为 0–255 整数。 */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** OKLCH：l 亮度 0–1，c 彩度（sRGB 内约 0–0.32），h 色相角 0–360。 */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

interface LinearRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** 只接受 #RRGGBB（契约里的颜色格式）；其它写法返回 null，由调用方忽略。 */
export const parseHexColor = (value: string): Rgb | null => {
  const match = HEX_COLOR.exec(value.trim());
  return match === null
    ? null
    : { r: parseInt(match[1] ?? "0", 16), g: parseInt(match[2] ?? "0", 16), b: parseInt(match[3] ?? "0", 16) };
};

const channelHex = (channel: number): string => channel.toString(16).padStart(2, "0").toUpperCase();

export const formatHexColor = ({ r, g, b }: Rgb): string => `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;

const toLinear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (value: number): number =>
  value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;

const linearOf = ({ r, g, b }: Rgb): LinearRgb => ({ r: toLinear(r), g: toLinear(g), b: toLinear(b) });

export const rgbToOklch = (rgb: Rgb): Oklch => {
  const { r, g, b } = linearOf(rgb);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(bAxis, a) * 180) / Math.PI;
  return { l: lightness, c: Math.hypot(a, bAxis), h: hue < 0 ? hue + 360 : hue };
};

const oklchToLinear = ({ l: lightness, c, h }: Oklch): LinearRgb => {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const bAxis = c * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * bAxis) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * bAxis) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * bAxis) ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
};

const GAMUT_EPSILON = 1e-4;

const inGamut = ({ r, g, b }: LinearRgb): boolean =>
  [r, g, b].every((channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON);

interface ChromaRange {
  readonly low: number;
  readonly high: number;
}

/** 保持亮度与色相时，色域内能取到的最大彩度：二分 20 次，精度远小于 1/255。 */
const maxChromaInGamut = (color: Oklch): number =>
  Array.from({ length: 20 }).reduce<ChromaRange>(
    ({ low, high }) => {
      const middle = (low + high) / 2;
      return inGamut(oklchToLinear({ ...color, c: middle })) ? { low: middle, high } : { low, high: middle };
    },
    { low: 0, high: color.c },
  ).low;

/** 超出 sRGB 时只降彩度，亮度与色相不变（推导出的颜色只损失鲜艳程度，不改明暗与色调）。 */
const fitIntoGamut = (color: Oklch): Oklch =>
  inGamut(oklchToLinear(color)) ? color : { ...color, c: maxChromaInGamut(color) };

const toChannel = (value: number): number => Math.round(Math.min(1, Math.max(0, fromLinear(value))) * 255);

export const oklchToRgb = (color: Oklch): Rgb => {
  const linear = oklchToLinear(fitIntoGamut({ ...color, l: Math.min(1, Math.max(0, color.l)) }));
  return { r: toChannel(linear.r), g: toChannel(linear.g), b: toChannel(linear.b) };
};

/** WCAG 相对亮度。 */
export const relativeLuminance = (rgb: Rgb): number => {
  const { r, g, b } = linearOf(rgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 对比度（1–21，与参数顺序无关）。 */
export const contrastRatio = (first: Rgb, second: Rgb): number => {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
};
