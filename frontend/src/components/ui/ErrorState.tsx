import { Button } from "./Button";

export interface ErrorStateProps {
  message: string;
  title?: string;
  // 传入时展示“重试”按钮；不传则只展示错误说明。
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ message, title = "加载失败", onRetry, retryLabel = "重试" }: ErrorStateProps) {
  return (
    <div role="alert" className="rounded-xl border border-line bg-surface p-6">
      <p className="text-micro text-danger">错误</p>
      <h2 className="mt-2 font-serif text-h2 text-ink">{title}</h2>
      <p className="mt-2 text-body text-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="mt-6">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
