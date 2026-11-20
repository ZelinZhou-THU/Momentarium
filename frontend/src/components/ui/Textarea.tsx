import { useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import { classNames } from "./classNames";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

// 与 Input 同款外观与可用性约定：自动关联 label、aria-describedby（error 优先于 hint）、aria-invalid；
// 多行文本允许纵向拖拽，横向保持与表单列同宽。
export function Textarea({ label, hint, error, id, rows = 3, className, ...rest }: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const messageId = error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined;

  return (
    <div className="flex w-full flex-col gap-2">
      {label ? (
        <label htmlFor={textareaId} className="text-caption text-muted">
          {label}
        </label>
      ) : null}
      <textarea
        {...rest}
        id={textareaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={classNames(
          "w-full resize-y rounded-md border bg-surface px-4 py-3 text-body text-ink transition-colors duration-150 ease-out placeholder:text-muted motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-danger" : "border-line",
          className,
        )}
      />
      {error ? (
        <p id={`${textareaId}-error`} className="text-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${textareaId}-hint`} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
