import { Button } from "../../../../../components/ui";

export interface SceneCoverActionProps {
  readonly enabled: boolean;
  readonly status: "idle" | "capturing" | "saving" | "success" | "error";
  readonly message?: string;
  readonly onCapture: () => void;
}

export function SceneCoverAction({ enabled, status, message, onCapture }: SceneCoverActionProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={onCapture} disabled={!enabled || status === "capturing" || status === "saving"}>
        {status === "capturing" ? "正在截图…" : status === "saving" ? "正在设置…" : "将当前视角设为封面"}
      </Button>
      {message ? <p role={status === "error" ? "alert" : "status"} className="text-caption text-muted">{message}</p> : null}
    </div>
  );
}
