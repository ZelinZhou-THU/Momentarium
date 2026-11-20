import { ColorSwatch } from "./ColorSwatch";

export interface PaletteStripProps {
  readonly colors: readonly string[];
  /** 读屏用的说明，如「这张照片的主色」。 */
  readonly label: string;
  /** 单个色块的尺寸与描边（Tailwind 类）。 */
  readonly swatchClassName: string;
}

/** 一行主色色块（照片解读、场景主色）；没有颜色时不渲染。 */
export function PaletteStrip({ colors, label, swatchClassName }: PaletteStripProps) {
  return colors.length === 0 ? null : (
    <span role="img" aria-label={label} className="flex items-center gap-1">
      {colors.map((color) => (
        <ColorSwatch key={color} color={color} className={swatchClassName} />
      ))}
    </span>
  );
}
