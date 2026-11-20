import type { RefObject } from "react";
import { Button, Spinner } from "../../../../../components/ui";
import type { SceneRunView } from "../../../../../objects/gallery/SceneRunView";
import type { CapturesMessage, SandboxPhotoTransfer } from "../../../../../scene/contract";
import { isActiveStatus, shouldAutoCaptureSandbox } from "../functions/reduceScenePanel";
import { describeSceneStage } from "../functions/describeSceneStage";
import { describeImmersiveSceneMeta } from "../functions/immersiveScene";
import { SceneImmersiveChrome } from "./SceneImmersiveChrome";
import type { SceneImmersiveAction } from "./SceneImmersiveChrome";
import { SceneSandboxStage } from "./SceneSandboxStage";
import type { SceneCoverCaptureController } from "../hooks/useSceneCoverCapture";
import type { SceneGenerationController } from "../hooks/useSceneGeneration";

export interface SceneStageProps {
  readonly controller: SceneGenerationController;
  readonly cover: SceneCoverCaptureController;
  readonly previewRun: SceneRunView | null;
  readonly sandboxCode: string | null;
  readonly sandboxPhotos: readonly SandboxPhotoTransfer[] | null;
  readonly showSandbox: boolean;
  readonly showCaptureDeferred: boolean;
  readonly effectiveVisible: boolean;
  readonly deferNotice: string | null;
  readonly isImmersive: boolean;
  readonly canImmerse: boolean;
  readonly exhibitionTitle: string;
  readonly immersiveNextAction: SceneImmersiveAction | null;
  readonly exitButtonRef: RefObject<HTMLButtonElement | null>;
  readonly entryButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onExitImmersive: () => void;
  readonly onImmersiveChange?: (immersive: boolean) => void;
  readonly onScrollIntoView: () => void;
  readonly onCaptureStarted: () => void;
  readonly onCaptured: (message: CapturesMessage) => void;
  readonly onRegenerate: () => void;
}

/**
 * 三维场景舞台：页内 16:9 深色区域，沉浸观看时同一元素铺满窗口（沙箱不重挂、场景不重载）。
 * 负责沙箱 / 准备中 / 延迟截图 / 占位四种呈现与沉浸层操作，不承载生成与候选业务状态。
 */
export function SceneStage({
  controller,
  cover,
  previewRun,
  sandboxCode,
  sandboxPhotos,
  showSandbox,
  showCaptureDeferred,
  effectiveVisible,
  deferNotice,
  isImmersive,
  canImmerse,
  exhibitionTitle,
  immersiveNextAction,
  exitButtonRef,
  entryButtonRef,
  onExitImmersive,
  onImmersiveChange,
  onScrollIntoView,
  onCaptureStarted,
  onCaptured,
  onRegenerate,
}: SceneStageProps) {
  const state = controller.state;
  const stage = describeSceneStage(state);

  return (
    <div
      role={isImmersive ? "dialog" : undefined}
      aria-modal={isImmersive ? true : undefined}
      aria-label={isImmersive ? "沉浸观看三维场景" : "三维场景舞台"}
      className={
        isImmersive
          ? "fixed inset-0 z-50 bg-night"
          : "relative mt-6 aspect-video w-full overflow-hidden rounded-xl bg-night"
      }
    >
      {showSandbox && previewRun !== null && sandboxCode !== null && sandboxPhotos !== null ? (
        <SceneSandboxStage
          runId={previewRun.runId}
          code={sandboxCode}
          photos={sandboxPhotos}
          captureAttempt={state.captureAttempt}
          captureViews={controller.captureViews}
          captureRequest={cover.coverRequest}
          onBuilt={() => cover.setBuiltRunId(previewRun.runId)}
          onCaptureFailure={cover.handleFailure}
          autoCapture={shouldAutoCaptureSandbox(state.status)}
          onCaptureStarted={onCaptureStarted}
          onCaptured={onCaptured}
          onRenderFailure={controller.reportRenderFailure}
          onCodeFailure={controller.submitCodeFailure}
          onEscape={isImmersive ? onExitImmersive : undefined}
        />
      ) : controller.isPreparingPhotos ? (
        <div className="flex h-full items-center justify-center gap-3">
          <Spinner tone="inverse" hideLabel label="正在准备沙箱展示图" />
          <p className="text-caption text-surface/70">正在准备沙箱展示图</p>
        </div>
      ) : showCaptureDeferred ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          {effectiveVisible ? (
            <>
              <Spinner tone="inverse" hideLabel label="正在准备渲染与截图" />
              <p className="mt-3 text-caption text-surface/70">正在等待沙箱恢复帧调度…</p>
            </>
          ) : (
            <>
              <p className="text-body text-surface">场景已就绪，请滚动到此处以完成渲染与评审。</p>
              <p className="mt-2 max-w-md text-caption text-surface/60">
                面板不在可见区域时，浏览器会节流沙箱帧调度；此时提交评审会被判定为帧率过低。
              </p>
              <Button variant="inversePrimary" size="sm" className="mt-4" onClick={onScrollIntoView}>
                去渲染
              </Button>
            </>
          )}
          {deferNotice === null ? null : (
            <p role="status" className="mt-3 text-caption text-accentSoft">
              {deferNotice}
            </p>
          )}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          {isActiveStatus(state.status) ? <Spinner tone="inverse" hideLabel label={stage.title} /> : null}
          <p className="mt-3 font-serif text-h2 text-surface">{stage.title}</p>
          <p className="mt-2 max-w-md text-caption text-surface/60">{stage.description}</p>
        </div>
      )}

      {isImmersive && previewRun !== null ? (
        <SceneImmersiveChrome
          title={exhibitionTitle}
          meta={describeImmersiveSceneMeta(previewRun)}
          exitButtonRef={exitButtonRef}
          nextAction={immersiveNextAction}
          onExit={onExitImmersive}
          onRegenerate={onRegenerate}
        />
      ) : canImmerse && onImmersiveChange !== undefined ? (
        <Button
          ref={entryButtonRef}
          variant="inversePrimary"
          size="sm"
          className="absolute bottom-4 right-4"
          onClick={() => onImmersiveChange(true)}
        >
          沉浸观看
        </Button>
      ) : null}
    </div>
  );
}
