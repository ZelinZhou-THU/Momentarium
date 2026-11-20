import { useSceneCaptureVisibility } from "./hooks/useSceneCaptureVisibility";
import { useEffect, useRef, useState } from "react";
import type { SceneRunView } from "../../../../objects/gallery/SceneRunView";
import type { CapturesMessage, ImageCapture } from "../../../../scene/contract";
import type { ScenePhotoSource } from "../../../../scene/photoDisplay";
import type { SceneApiClient } from "./sceneClient";
import {
  canStartCapture,
  captureStartKey,
  shouldDeferCapture,
  shouldRetryFrameStarvedCapture,
} from "./functions/captureVisibility";
import { scheduleCaptureTimeout } from "./functions/captureTimeout";
import { canViewSceneImmersive } from "./functions/immersiveScene";
import {
  isActiveStatus,
  isPreviewActive,
  runChangeKey,
  shouldAutoCaptureSandbox,
} from "./functions/reduceScenePanel";
import { SCENE_HINT_MAX_LENGTH, useSceneGeneration } from "./hooks/useSceneGeneration";
import { useSceneRevisionCandidate } from "./hooks/useSceneRevisionCandidate";
import { canRequestSceneCover } from "./functions/coverCaptureGuard";
import { useSceneCoverCapture } from "./hooks/useSceneCoverCapture";
import { useImmersiveScene } from "./hooks/useImmersiveScene";
import type { SceneImmersiveAction } from "./components/SceneImmersiveChrome";
import { SceneCandidateBanner } from "./components/SceneCandidateBanner";
import { SceneCoverAction } from "./components/SceneCoverAction";
import { ScenePromptBar } from "./components/ScenePromptBar";
import { SceneRevisionBar } from "./components/SceneRevisionBar";
import { SceneRunResult } from "./components/SceneRunResult";
import { SceneStaleBanner } from "./components/SceneStaleBanner";
import { SceneStage } from "./components/SceneStage";
import { SceneStageTimeline } from "./components/SceneStageTimeline";
import type { ScenePanelStatus } from "./objects/ScenePanelState";

/** 截图/评审阶段的状态（awaiting_capture 需要沙箱截图推进；capturing/reviewing 已挂载不再回退）。 */
const CAPTURE_STAGE_STATUSES: readonly ScenePanelStatus[] = [
  "awaiting_capture",
  "capturing",
  "reviewing",
];

/** Workspace 侧传入的照片形状：id + 带令牌的照片内容路由。 */
export type ScenePanelPhoto = ScenePhotoSource;

export type { SceneImmersiveAction };

export interface ScenePanelProps {
  readonly exhibitionId: string;
  /** 展览照片（id + 带令牌内容路由）；面板按运行快照的 photoIds 顺序使用。 */
  readonly photos: readonly ScenePanelPhoto[];
  /** 隐藏时仍推进运行；已完成场景的预览按需准备。 */
  readonly visible?: boolean;
  /** 工作台 detail.sceneRun（最新运行）；不传则面板自行 getscenerun。 */
  readonly initialRun?: SceneRunView | null;
  /** 工作台 detail.currentSceneRun（当前采用指针）；与最新运行明确区分。 */
  readonly currentRun?: SceneRunView | null;
  readonly sceneStale?: boolean;
  readonly onCancelSceneCover?: () => void;
  readonly onSaveSceneCover?: (runId: string, capture: ImageCapture) => Promise<void>;
  /** 依赖注入（测试/本地 mock）；生产不传。 */
  readonly client?: SceneApiClient;
  /**
   * 运行状态变化时通知页面静默刷新 detail：让 PublishBar/页头/分区徽标自动拿到
   * sceneRun/sceneStale/publication/hasUnpublishedChanges，无需整页刷新。
   */
  readonly onRunChanged?: (run: SceneRunView) => void;
  /** 展览标题（沉浸层顶部显示）。 */
  readonly exhibitionTitle?: string;
  /** 页面希望处于沉浸观看（如网址 view=immersive）；只有场景可预览时才真正生效。 */
  readonly immersive?: boolean;
  readonly onImmersiveChange?: (immersive: boolean) => void;
  /** 沉浸层右下角的下一步动作（如「发布展览」）；由页面负责同时退出沉浸观看。null 不显示。 */
  readonly immersiveNextAction?: SceneImmersiveAction | null;
  readonly className?: string;
}

const NEW_RUN_STATUSES: readonly ScenePanelStatus[] = ["idle", "failed", "cancelled"];

/**
 * 工作台「三维场景」区域（D4/D5）：氛围提示 → 生成 → 阶段轮询 → 沙箱渲染并自动截图 →
 * reviewscene 回传 → 展示评分/问题/预览/重新生成。
 *
 * P1 修复（离屏 rAF 节流）：跨源 sandbox iframe 不在视口内时浏览器会节流 rAF，SceneRuntime 采样的
 * fps≈0 会让 reviewscene 被硬门禁拒绝。这里用 IntersectionObserver + document.visibilityState 做可见性门控：
 * awaiting_capture 时若不可见则暂缓截图/评审并提示用户；可见后再等 2 帧才开始截图，且提交前校验 fps 证据可用。
 */
export default function ScenePanel({
  exhibitionId,
  photos,
  visible = true,
  initialRun,
  currentRun = null,
  sceneStale = false,
  onSaveSceneCover,
  onCancelSceneCover,
  client,
  onRunChanged,
  exhibitionTitle = "",
  immersive = false,
  onImmersiveChange,
  immersiveNextAction = null,
  className,
}: ScenePanelProps) {
  const [dismissedCandidateId, setDismissedCandidateId] = useState<string | null>(null);
  const controller = useSceneGeneration({ exhibitionId, photos, initialRun, currentRun, client, visible, dismissedCandidateId });
  const [hint, setHint] = useState("");
  const [sceneNotice, setSceneNotice] = useState<string | null>(null);
  const { state } = controller;
  const run = state.run;
  const revision = useSceneRevisionCandidate({
    currentRun,
    run,
    isActionPending: controller.isActionPending,
    hasActiveRun: isActiveStatus(state.status) || state.status === "capturing",
    sceneStale,
    reloadRun: controller.reloadRun,
    onRunChanged,
    setSceneNotice,
    dismissedCandidateId,
    setDismissedCandidateId,
  });
  const { candidateRun } = revision;
  const activePreviewRun =
    run !== null &&
    !run.dismissed &&
    run.runId !== dismissedCandidateId &&
    isPreviewActive(state.status)
      ? run
      : null;
  /** 候选预览用候选代码；当前预览用 currentSceneRun.code（旧数据回退最新运行）。 */
  const previewRun = candidateRun ?? activePreviewRun ?? currentRun;
  const previewIsCurrent = previewRun !== null && previewRun.isCurrent;
  const cover = useSceneCoverCapture(
    previewIsCurrent ? previewRun.runId : undefined,
    controller.isActionPending,
    onSaveSceneCover,
    onCancelSceneCover,
  );

  const { sectionRef, panelVisible, documentVisible, captureArmed, deferNotice, setDeferNotice,
    effectiveVisible, effectiveVisibleRef } = useSceneCaptureVisibility(state.status, state.captureAttempt);

  /**
   * 运行状态变化时通知页面静默刷新详情，让分区徽标与"下一步"在生成过程中同步
   * （去重：同一 run 的同一状态只通知一次；以 initialRun 为初值，挂载时不多刷一次）。
   */
  const notifiedRunKeyRef = useRef<string | null>(
    initialRun === undefined || initialRun === null ? null : runChangeKey(initialRun),
  );
  useEffect(() => {
    if (run === null || onRunChanged === undefined) {
      return;
    }
    const key = runChangeKey(run);
    if (notifiedRunKeyRef.current === key) {
      return;
    }
    notifiedRunKeyRef.current = key;
    onRunChanged(run);
  }, [onRunChanged, run]);

  const canGenerate =
    !controller.isActionPending &&
    (NEW_RUN_STATUSES.some((status) => status === state.status) ||
      (state.status === "error" && run === null) ||
      state.status === "succeeded");
  const canCancel = isActiveStatus(state.status) && !controller.isActionPending;

  const sandboxPhotos =
    previewRun !== null &&
    controller.displayPhotos !== null &&
    controller.displayPhotos.runId === previewRun.runId
      ? controller.displayPhotos.photos
      : null;
  const sandboxCode = previewRun?.code ?? null;

  const hasSandboxPayload = previewRun !== null && sandboxCode !== null && sandboxPhotos !== null;
  const captureStageReady = canStartCapture(
    state.status,
    captureArmed,
    panelVisible,
    documentVisible,
  );
  const showSandbox =
    hasSandboxPayload &&
    (state.status === "succeeded" ||
      captureStageReady ||
      (CAPTURE_STAGE_STATUSES.some((status) => status === state.status) &&
        state.status !== "awaiting_capture") ||
      previewIsCurrent);
  /** awaiting_capture 但尚未满足可见/等帧条件：显示提示而不是挂载沙箱（避免提交 fps=0 证据）。 */
  const showCaptureDeferred =
    shouldDeferCapture(state.status, panelVisible, documentVisible) ||
    (state.status === "awaiting_capture" && !captureStageReady);

  /* 沉浸观看：同一个舞台元素在页内 16:9 与全屏之间切换样式，沙箱不重挂、场景不重载。 */
  const canImmerse = canViewSceneImmersive(state.status, showSandbox);
  const isImmersive = immersive && canImmerse;
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  const entryButtonRef = useRef<HTMLButtonElement>(null);
  const exitImmersive = (): void => onImmersiveChange?.(false);
  useImmersiveScene(isImmersive, exitImmersive, exitButtonRef, entryButtonRef);

  const scrollPanelIntoView = (): void => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleGenerate = (): void => {
    // 生成与截图在页内舞台进行（全屏截图会超过宽度门禁），先退出沉浸观看。
    if (isImmersive) {
      exitImmersive();
    }
    if (!effectiveVisibleRef.current) {
      scrollPanelIntoView();
    }
    setSceneNotice(null);
    cover.cancel();
    controller.generate(hint);
  };

  /** 截图完成回调：离屏时不提交评审（离屏 rAF 节流会使 fps 采样为 0），回到 awaiting_capture 等可见后重试。 */
  const handleCaptured = (message: CapturesMessage): void => {
    if (cover.handleCaptured(message)) return;
    if (state.status === "succeeded") return;
    if (!effectiveVisibleRef.current) {
      setDeferNotice("渲染期间面板不在屏幕内，已暂缓评审；请保持本区域可见后重试。");
      controller.retryCapture();
      return;
    }
    if (shouldRetryFrameStarvedCapture(message.runtime.fps, state.captureAttempt)) {
      setDeferNotice("渲染时帧率采样不足（浏览器可能在节流本页），已自动重新截图。");
      controller.retryCapture();
      return;
    }
    controller.submitCapture(message);
  };

  /* 记录“本轮截图是否真正开始过”：awaiting 可见但沙箱迟迟未开始（如 revise 后未重挂）时用看门狗补触发一次。 */
  const lastStartedKeyRef = useRef<string | null>(null);
  const watchdogFiredKeyRef = useRef<string | null>(null);
  const retryCaptureRef = useRef(controller.retryCapture);
  retryCaptureRef.current = controller.retryCapture;
  const handleCaptureStarted = (): void => {
    if (run !== null) {
      lastStartedKeyRef.current = captureStartKey(run, state.captureAttempt);
    }
    controller.reportCaptureStarted();
  };

  useEffect(() => {
    if (
      state.status !== "awaiting_capture" ||
      !effectiveVisible ||
      run === null ||
      !hasSandboxPayload
    ) {
      return;
    }
    const key = captureStartKey(run, state.captureAttempt);
    if (lastStartedKeyRef.current === key || watchdogFiredKeyRef.current === key) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (lastStartedKeyRef.current === key) {
        return;
      }
      watchdogFiredKeyRef.current = key;
      retryCaptureRef.current();
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [effectiveVisible, hasSandboxPayload, run, state.captureAttempt, state.status]);

  /* 截图开始后没有回调时退出等待；离屏期间不计时，避免浏览器节流造成误报。 */
  useEffect(() => {
    if (state.status !== "capturing" || !effectiveVisible) return;
    return scheduleCaptureTimeout(() => {
      controller.reportRenderFailure("渲染截图等待超时，请保持场景可见后重试。");
    });
  }, [state.status, state.captureAttempt, state.run?.runId, effectiveVisible, controller.reportRenderFailure]);

  return (
    <section
      ref={sectionRef}
      className={`rounded-xl border border-line bg-surface p-6 shadow-sm ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-h2 text-ink">三维场景</h2>
          <p className="mt-1 text-caption text-muted">
            三维场景表达这组照片的情绪与记忆；照片可在照片区查看大图与图注，场景本身不再陈列照片。
          </p>
        </div>
        {currentRun !== null || run !== null ? (
          <div className="flex flex-col gap-1 text-right text-micro text-muted">
            {currentRun === null ? (
              <p>当前场景：还没有采用场景</p>
            ) : (
              <p>
                当前场景 · 运行 {currentRun.runId.slice(0, 8)} ·{" "}
                {currentRun.kind === "revise" ? "修订" : currentRun.kind === "restore" ? "恢复" : "生成"}
              </p>
            )}
            {run !== null ? (
              <p>
                最新任务 · 运行 {run.runId.slice(0, 8)} · 第 {run.attempts + 1} 次 ·{" "}
                {run.source === "fallback" ? "兜底场景" : "AI 场景"}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      <SceneStage
        controller={controller}
        cover={cover}
        previewRun={previewRun}
        sandboxCode={sandboxCode}
        sandboxPhotos={sandboxPhotos}
        showSandbox={showSandbox}
        showCaptureDeferred={showCaptureDeferred}
        effectiveVisible={effectiveVisible}
        deferNotice={deferNotice}
        isImmersive={isImmersive}
        canImmerse={canImmerse}
        exhibitionTitle={exhibitionTitle}
        immersiveNextAction={immersiveNextAction}
        exitButtonRef={exitButtonRef}
        entryButtonRef={entryButtonRef}
        onExitImmersive={exitImmersive}
        onImmersiveChange={onImmersiveChange}
        onScrollIntoView={scrollPanelIntoView}
        onCaptureStarted={handleCaptureStarted}
        onCaptured={handleCaptured}
        onRegenerate={handleGenerate}
      />
      {showSandbox ? (
        <p className="mt-2 text-caption text-muted">
          {shouldAutoCaptureSandbox(state.status)
            ? "正在渲染并截取两个视角回传评审，请保持本区域在屏幕内。"
            : candidateRun !== null
              ? "候选预览（未采用） · 拖动旋转、滚轮缩放；采用后才会成为当前场景。"
              : "当前采用场景预览 · 拖动旋转、滚轮缩放。"}
        </p>
      ) : null}

      {sceneStale && currentRun !== null && !isActiveStatus(state.status) ? <SceneStaleBanner /> : null}

      {candidateRun === null ? null : (
        <SceneCandidateBanner
          candidate={candidateRun}
          accepting={revision.acceptingCandidate}
          error={revision.acceptError}
          stale={sceneStale}
          onAccept={revision.acceptCandidate}
          onDismiss={revision.dismissCandidate}
        />
      )}

      {run?.dismissed && sceneNotice === null ? (
        <p role="status" className="mt-3 text-caption text-muted">
          最近的修订候选已放弃；当前场景未改变，可在场景版本中查看历史。
        </p>
      ) : null}

      {sceneNotice === null ? null : (
        <p role="status" className="mt-3 text-caption text-muted">
          {sceneNotice}
        </p>
      )}

      {state.status === "succeeded" && onSaveSceneCover ? (
        <SceneCoverAction
          enabled={canRequestSceneCover(
            showSandbox && previewIsCurrent && cover.builtRunId === previewRun?.runId,
            sceneStale,
            controller.isActionPending,
          )}
          status={cover.coverStatus.status}
          message={cover.coverStatus.message}
          onCapture={cover.requestCover}
        />
      ) : null}

      <SceneRevisionBar
        instruction={revision.revisionInstruction}
        onInstructionChange={revision.updateInstruction}
        canRevise={revision.canRevise}
        isPending={revision.revisionPending}
        error={revision.revisionError}
        disabledReason={revision.revisionDisabledReason}
        onSubmit={revision.revise}
      />

      <ScenePromptBar
        hint={hint}
        onHintChange={setHint}
        maxLength={SCENE_HINT_MAX_LENGTH}
        canGenerate={canGenerate}
        canCancel={canCancel}
        isActionPending={controller.isActionPending}
        onGenerate={handleGenerate}
        onCancel={controller.cancel}
      />

      <SceneStageTimeline state={state} />

      <SceneRunResult
        state={state}
        onRegenerate={handleGenerate}
        onRetryCapture={controller.retryCapture}
        onReload={controller.reloadRun}
      />
    </section>
  );
}
