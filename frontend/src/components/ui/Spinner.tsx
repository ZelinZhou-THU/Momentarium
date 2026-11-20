import { classNames } from "./classNames";

export type SpinnerSize = "sm" | "md";
export type SpinnerTone = "default" | "inverse";

export interface SpinnerProps {
  size?: SpinnerSize;
  // inverse 用于 accent / danger 深色按钮内部，保证加载指示可见。
  tone?: SpinnerTone;
  label?: string;
  hideLabel?: boolean;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: "h-1 w-4",
  md: "h-1 w-8",
};

const toneClasses: Record<SpinnerTone, string> = {
  default: "bg-accent",
  inverse: "bg-surface",
};

// 设计系统只保留 md / xl 两档圆角且不写自定义 CSS：用一条呼吸的短横作为加载指示，
// 不做旋转与弹跳；prefers-reduced-motion 下静止，改由文字标签说明状态。
export function Spinner({ size = "md", tone = "default", label = "加载中", hideLabel = false }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={classNames(
          "animate-pulse rounded-md motion-reduce:animate-none",
          sizeClasses[size],
          toneClasses[tone],
        )}
      />
      <span className={hideLabel ? "sr-only" : "text-caption text-muted"}>{label}</span>
    </span>
  );
}
