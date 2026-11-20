import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import { classNames } from "./classNames";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

// 标签、提示与错误信息按可用性规则自动关联（htmlFor / aria-describedby / aria-invalid）。
// 错误优先于提示展示，避免同一字段同时出现两条说明。
export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex w-full flex-col gap-2">
      {label ? (
        <label htmlFor={inputId} className="text-caption text-muted">
          {label}
        </label>
      ) : null}
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={classNames(
          "w-full rounded-md border bg-surface px-4 py-3 text-body text-ink transition-colors duration-150 ease-out placeholder:text-muted motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-danger" : "border-line",
          className,
        )}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
