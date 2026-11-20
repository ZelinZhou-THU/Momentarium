import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";

export interface DialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  // 交互与焦点管理交给原生 dialog（showModal）：Esc 关闭、焦点囚禁、焦点归还、顶层遮罩均由浏览器负责。
  // Dialog 需常驻在页面中，用 open 控制显隐；open 必须由 onClose 驱动回 false。
  onClose: () => void;
}

export function Dialog({ open, title, children, footer, onClose }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="w-full max-w-xl bg-transparent p-4 text-ink backdrop:bg-ink/40"
    >
      <div className="mx-auto w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-serif text-h2 text-ink">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="-mt-1 shrink-0">
            关闭
          </Button>
        </div>
        {children ? <div className="mt-4 text-body text-muted">{children}</div> : null}
        {footer ? <div className="mt-6 flex justify-end gap-3">{footer}</div> : null}
      </div>
    </dialog>
  );
}
