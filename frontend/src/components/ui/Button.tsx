import type { ButtonHTMLAttributes, Ref } from "react";
import { classNames } from "./classNames";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse" | "inversePrimary";
export type ButtonSize = "md" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  // React 19：ref 作为普通 prop 透传到 <button>（如沉浸层移交焦点）。
  ref?: Ref<HTMLButtonElement>;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-surface hover:opacity-90",
  secondary: "border border-line bg-surface text-ink hover:bg-accentSoft",
  ghost: "text-muted hover:bg-accentSoft hover:text-ink",
  danger: "bg-danger text-surface hover:opacity-90",
  // 深色底（顶栏、工作台页头、场景舞台）上的次要按钮。
  inverse: "bg-surface/10 text-surface hover:bg-surface/20",
  // 深色底上的主按钮：陶土 accent 在 night 上对比不足，改用浅陶土底 + 深色字。
  inversePrimary: "bg-accentSoft text-night hover:opacity-90",
};

const focusOffsetClasses: Record<ButtonVariant, string> = {
  primary: "focus-visible:ring-offset-bg",
  secondary: "focus-visible:ring-offset-bg",
  ghost: "focus-visible:ring-offset-bg",
  danger: "focus-visible:ring-offset-bg",
  inverse: "focus-visible:ring-offset-night",
  inversePrimary: "focus-visible:ring-offset-night",
};

const sizeClasses: Record<ButtonSize, string> = {
  md: "px-6 py-3 text-body",
  sm: "px-4 py-2 text-caption",
};

// 表单外的按钮默认 type="button"，避免误触发表单提交；提交按钮显式传 type="submit"。
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      className={classNames(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition duration-150 ease-out active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        sizeClasses[size],
        variantClasses[variant],
        focusOffsetClasses[variant],
        className,
      )}
    >
      {loading ? <Spinner size="sm" tone={variant === "primary" || variant === "danger" || variant === "inverse" ? "inverse" : "default"} hideLabel /> : null}
      {children}
    </button>
  );
}
