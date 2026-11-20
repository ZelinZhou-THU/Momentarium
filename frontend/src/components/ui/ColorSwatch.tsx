import { classNames } from "./classNames";

export interface ColorSwatchProps {
  readonly color: string;
  readonly className: string;
}

/**
 * 色块：颜色值来自 AI 解读（运行时数据），Tailwind 无法静态枚举，只能用内联 backgroundColor；
 * 尺寸与圆角仍由 Tailwind 类控制。照片记忆档案、看展侧栏与大图、展览卡片共用。
 */
export function ColorSwatch({ color, className }: ColorSwatchProps) {
  return <span className={classNames("block rounded-md", className)} style={{ backgroundColor: color }} title={color} />;
}
