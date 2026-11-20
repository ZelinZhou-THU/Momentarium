import { useEffect, useRef } from "react";
import type { BuiltMessage, CapturesMessage, CaptureRequestMessage, CaptureView, SandboxPhotoTransfer } from "../../../../../scene/contract";
import type { SceneRuntimeEvidence } from "../../../../../apis/scene/objects/SceneRuntimeEvidence";
import { reportCaptureStartOnce } from "../functions/reportCaptureStartOnce";
import { describeSandboxFailure } from "../../../../../scene/functions/describeSceneError";
import { toCodeFailureEvidence } from "../../../../../scene/functions/toCodeFailureEvidence";
import { SceneSandbox } from "../../../../../scene/sandbox";
import type { SceneSandboxFailure } from "../../../../../scene/sandbox";

export interface SceneSandboxStageProps {
  readonly runId: string;
  readonly code: string;
  readonly photos: readonly SandboxPhotoTransfer[];
  readonly captureAttempt: number;
  readonly captureViews: readonly CaptureView[];
  /**
   * 是否在挂载后自动渲染+截图并进入评审：
   * awaiting_capture/capturing/reviewing 为 true；succeeded（评审通过后的实时预览，含整页刷新恢复的 initialRun）
   * 必须为 false，否则会把已结束的 run 再次回传 reviewscene → 409「场景运行已结束，不能重复评审」。
   */
  readonly autoCapture: boolean;
  readonly captureRequest?: CaptureRequestMessage | null;
  readonly onBuilt?: (message: BuiltMessage) => void;
  readonly onCaptureFailure?: (failure: SceneSandboxFailure) => void;
  readonly onCaptureStarted: () => void;
  readonly onCaptured: (message: CapturesMessage) => void;
  readonly onRenderFailure: (message: string) => void;
  /** 评审轮次中生成代码崩溃：交给评审回灌修复，而不是停在错误态。 */
  readonly onCodeFailure: (evidence: SceneRuntimeEvidence) => void;
  /** 焦点在沙箱内按 Esc（如沉浸观看退出，UI-05）；不传则忽略。 */
  readonly onEscape?: () => void;
}

const EMPTY_CAPTURE_VIEWS: readonly CaptureView[] = [];

/**
 * 沙箱渲染体（铺满父级舞台）：awaiting_capture 时自动渲染并截图 2 个视角；
 * 评审轮次里代码自身崩溃（编译失败/build 抛错/超时）不停在错误态，而是带着错误回传评审进入修复；
 * 评审通过后继续作为实时预览（可拖拽旋转、滚轮缩放），不再截图/回传评审。
 * 舞台尺寸由 ScenePanel 决定（页内 16:9 或沉浸全屏），切换时本组件不重挂。
 * 场景为记忆意境，photos 仍传给 ctx 以兼容旧场景代码；照片大图与图注在照片区查看。
 */
export function SceneSandboxStage({
  runId,
  code,
  photos,
  captureAttempt,
  captureViews,
  autoCapture,
  captureRequest,
  onBuilt,
  onCaptureFailure,
  onCaptureStarted,
  onCaptured,
  onRenderFailure,
  onCodeFailure,
  onEscape,
}: SceneSandboxStageProps) {
  const startedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    reportCaptureStartOnce(startedRef, autoCapture, runId, captureAttempt, onCaptureStarted);
  }, [autoCapture, runId, captureAttempt, onCaptureStarted]);

  const handleFailure = (failure: SceneSandboxFailure): void => {
    const evidence = autoCapture ? toCodeFailureEvidence(failure.code, failure.phase, failure.message) : null;
    if (evidence !== null) {
      onCodeFailure(evidence);
      return;
    }
    onRenderFailure(describeSandboxFailure(failure.code, failure.message));
  };

  return (
    <SceneSandbox
      key={`${runId}-${captureAttempt}`}
      code={code}
      photos={photos}
      runId={runId}
      captureRequest={captureRequest}
      onBuilt={onBuilt}
      onCaptureFailure={onCaptureFailure}
      captureViews={autoCapture ? captureViews : EMPTY_CAPTURE_VIEWS}
      sessionLimitMs={null}
      className="h-full w-full"
      onCaptured={onCaptured}
      onEscapeKeyDown={onEscape}
      onFailure={handleFailure}
    />
  );
}
