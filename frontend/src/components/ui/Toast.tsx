import { useEffect } from "react";
import { Button } from "./Button";
import { classNames } from "./classNames";

export type ToastTone = "info" | "success" | "error";

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  // 0 表示不自动关闭，由用户点“关闭”。
  durationMs?: number;
  onDismiss: () => void;
}

const toneClasses: Record<ToastTone, string> = {
  info: "border-line bg-surface text-ink",
  success: "border-accent bg-accentSoft text-ink",
  error: "border-danger bg-surface text-ink",
};

// 页面级瞬时反馈：固定底部右侧，role=status/alert 交给读屏，倒计时结束或点击关闭后由调用方移除。
export function Toast({ message, tone = "info", durationMs = 4000, onDismiss }: ToastProps) {
  useEffect(() => {
    if (durationMs <= 0) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onDismiss]);

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={classNames(
        "fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-sm",
        toneClasses[tone],
      )}
    >
      <p className="text-body">{message}</p>
      <Button variant="ghost" size="sm" onClick={onDismiss} className="-my-1 shrink-0">
        关闭
      </Button>
    </div>
  );
}
