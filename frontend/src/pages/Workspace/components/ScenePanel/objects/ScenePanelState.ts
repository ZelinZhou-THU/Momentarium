import type { SceneRunView } from "../../../../../objects/gallery/SceneRunView";

/**
 * ScenePanel 状态机（D4）。状态取自契约 §4.1 的运行状态，外加渲染/截图与请求错误的本地阶段：
 * loading / idle / queued / generating / awaiting_capture / capturing / reviewing /
 * succeeded / failed / cancelled / error。
 *
 * 所有跳转由 本面板的 `functions/reduceScenePanel.ts` 的纯函数完成，便于对状态机做无 DOM 测试。
 */
export type ScenePanelStatus =
  | "loading"
  | "idle"
  | "queued"
  | "generating"
  | "awaiting_capture"
  | "capturing"
  | "reviewing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "error";

interface CaptureAttempt {
  /** 截图失败重试时递增，作为沙箱重建 key。 */
  readonly captureAttempt: number;
}

export type ScenePanelState = CaptureAttempt & (
  | { readonly status: "loading" | "idle"; readonly run: null; readonly message: null }
  | {
      readonly status: Exclude<ScenePanelStatus, "loading" | "idle" | "error">;
      readonly run: SceneRunView;
      readonly message: null;
    }
  | { readonly status: "error"; readonly run: SceneRunView | null; readonly message: string }
);

export type ScenePanelEvent =
  | { readonly type: "load_started" }
  | { readonly type: "run_loaded"; readonly run: SceneRunView | null }
  | { readonly type: "run_updated"; readonly run: SceneRunView }
  | { readonly type: "run_failed"; readonly message: string }
  | { readonly type: "capture_started" }
  | { readonly type: "capture_completed" }
  | { readonly type: "capture_retry" }
  | { readonly type: "completed"; readonly run: SceneRunView }
  | { readonly type: "reset"; readonly run: SceneRunView | null };
