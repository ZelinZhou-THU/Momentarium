import "react";

// 允许在 style 中写 CSS 自定义属性（如卡片局部的 --color-accent），值仍受类型约束。
declare module "react" {
  interface CSSProperties {
    readonly [variable: `--${string}`]: string | undefined;
  }
}
