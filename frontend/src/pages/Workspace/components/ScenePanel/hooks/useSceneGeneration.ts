import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ApiError } from "../../../../../apis/shared/ApiError";
import type { CapturesMessage, CaptureView, SandboxPhotoTransfer } from "../../../../../scene/contract";
import { CAPTURE_VIEWS } from "../../../../../scene/contract";
import type { SceneRunView } from "../../../../../objects/gallery/SceneRunView";
import { describeSceneError } from "../../../../../scene/functions/describeSceneError";
import { scenePollDelayMs } from "../functions/describeSceneProgress";
import { prepareDisplayPhotos } from "../../../../../scene/photoDisplay";
import type { ScenePhotoSource } from "../../../../../scene/photoDisplay";
import { createInitialScenePanelState, canSubmitCapture, captureSubmitKey, isActiveStatus, isPollingStatus, reduceScenePanel, scenePreparationTarget, shouldPrepareScenePhotos } from "../functions/reduceScenePanel";
import { toSceneRuntimeEvidence } from "../../../../../scene/functions/toSceneRuntimeEvidence";
import type { SceneRuntimeEvidence } from "../../../../../apis/scene/objects/SceneRuntimeEvidence";
import { createSceneApiClient } from "../sceneClient";
import type { SceneApiClient } from "../sceneClient";
import type { ScenePanelState } from "../objects/ScenePanelState";

/** 轮询间隔（spec 要求 2s 且避免并发请求）。 */
export const SCENE_POLL_INTERVAL_MS = 2_000;
/** 氛围提示输入上限（spec §9.2 userHint ≤80 字）。 */
export const SCENE_HINT_MAX_LENGTH = 80;

export interface SceneGenerationOptions {
  readonly exhibitionId: string;
  /** 展览当前照片（顺序无关，进入沙箱前按 run.photoIds 重排）。 */
  readonly photos: readonly ScenePhotoSource[];
  readonly visible?: boolean;
  readonly dismissedCandidateId?: string | null;
  /** 工作台已加载的 detail.sceneRun（最新运行）；undefined 表示让面板自行 getscenerun。 */
  readonly initialRun?: SceneRunView | null;
  /** 当前采用场景（detail.currentSceneRun）；最新运行失败/取消时用它准备当前场景预览。 */
  readonly currentRun?: SceneRunView | null;
  /** 可注入替身（测试/本地 mock）；生产不传，走 createSceneApiClient()。 */
  readonly client?: SceneApiClient;
  readonly pollIntervalMs?: number;
  readonly captureViews?: readonly CaptureView[];
}

export interface SceneDisplayPhotos {
  readonly runId: string;
  readonly photos: readonly SandboxPhotoTransfer[];
}

export interface SceneGenerationController {
  readonly state: ScenePanelState;
  /** 当前 run 的展示图（按 run.photoIds 顺序）；未就绪为 null。 */
  readonly displayPhotos: SceneDisplayPhotos | null;
  readonly isPreparingPhotos: boolean;
  readonly isActionPending: boolean;
  readonly captureViews: readonly CaptureView[];
  generate(hint: string): void;
  cancel(): void;
  retryCapture(): void;
  reloadRun(): void;
  submitCapture(message: CapturesMessage): void;
  /** 生成代码在沙箱里崩溃（编译失败/build 抛错/超时）：不截图，把错误交给评审回灌修复。 */
  submitCodeFailure(evidence: SceneRuntimeEvidence): void;
  /** 沙箱开始渲染（awaiting_capture → capturing）。 */
  reportCaptureStarted(): void;
  /** 沙箱渲染/截图失败（WebGL 不可用、build 超时等），进入可重试的 error 状态。 */
  reportRenderFailure(message: string): void;
}

/**
 * 场景生成编排：加载/轮询运行状态、准备展示图、在 awaiting_capture 时驱动沙箱截图并回传评审。
 * 状态跳转本身在 reduceScenePanel 纯函数里，便于无 DOM 测试。
 */
export const useSceneGeneration = (options: SceneGenerationOptions): SceneGenerationController => {
  const clientRef = useRef<SceneApiClient | null>(options.client ?? null);
  const client = clientRef.current ?? createSceneApiClient();
  clientRef.current = client;

  const [state, dispatch] = useReducer(reduceScenePanel, options.initialRun, createInitialScenePanelState);
  const [displayPhotos, setDisplayPhotos] = useState<SceneDisplayPhotos | null>(null);
  const [isPreparingPhotos, setIsPreparingPhotos] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  /** 轮询节拍：状态对象内容不变（updatedAt 相同）时也要重新计时，否则轮询会停。 */
  const [pollTick, setPollTick] = useState(0);

  const pollInFlightRef = useRef(false);
  const pollStartedAtRef = useRef<number | null>(null);
  /** 评审提交去重：同一 run 的同一轮 attempts 只提交一次（retryCapture/generate 时重置）。 */
  const submittedKeyRef = useRef<string | null>(null);
  /**
   * 本轮“沙箱已开始截图”的同步标记（captureSubmitKey）。截图完成回调可能早于 React 提交
   * capturing 状态，不能只依赖 state.status；用 ref 保证首次加载/revise 后的第一次截图不被丢弃。
   */
  const captureStartedKeyRef = useRef<string | null>(null);
  const runIdRef = useRef<string | null>(state.run?.runId ?? null);
  runIdRef.current = state.run?.runId ?? null;

  /**
   * 终态保护：取消成功后迟到的轮询 / reviewscene 响应不得再覆盖 cancelled 状态
   * （后端对非 awaiting_capture 回传会返回 409；若把它当 error 展示会与“已停止生成”矛盾）。
   */
  const terminalRef = useRef(false);
  const acceptRun = (run: SceneRunView): void => {
    if (terminalRef.current) {
      return;
    }
    if (run.status === "succeeded" || run.status === "cancelled" || run.status === "failed") {
      terminalRef.current = true;
    }
    dispatch({ type: "run_updated", run });
  };

  const pollIntervalMs = options.pollIntervalMs ?? SCENE_POLL_INTERVAL_MS;
  const captureViews = options.captureViews ?? CAPTURE_VIEWS;

  /* 首次进入：没有 initialRun 时自行读取最近一次运行。 */
  useEffect(() => {
    if (options.initialRun !== undefined) return;
    let active = true;
    dispatch({ type: "load_started" });
    client.getSceneRun(options.exhibitionId).then(
      (run) => {
        if (active) dispatch({ type: "run_loaded", run });
      },
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.code === "NOT_FOUND") {
          dispatch({ type: "run_loaded", run: null });
          return;
        }
        dispatch({ type: "run_failed", message: describeSceneError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [client, options.exhibitionId, options.initialRun]);

  /* 轮询：仅 queued/generating/reviewing；每次请求结束后由状态变化触发下一次，避免并发。 */
  useEffect(() => {
    if (!isPollingStatus(state.status)) {
      pollStartedAtRef.current = null;
      return;
    }
    if (pollStartedAtRef.current === null) pollStartedAtRef.current = Date.now();
    // 不设前端超时（spec：无产品级超时，后端看门狗兜底）：轮询久了只放慢频率，由用户决定是否停止生成。
    const delayMs = scenePollDelayMs(Date.now() - pollStartedAtRef.current, pollIntervalMs);
    const timer = window.setTimeout(() => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      client.getSceneRun(options.exhibitionId).then(
        (run) => {
          pollInFlightRef.current = false;
          acceptRun(run);
          setPollTick((tick) => tick + 1);
        },
        (error: unknown) => {
          pollInFlightRef.current = false;
          if (!terminalRef.current) {
            if (error instanceof ApiError && error.code === "NOT_FOUND") {
              dispatch({ type: "run_loaded", run: null });
            } else {
              dispatch({ type: "run_failed", message: describeSceneError(error) });
            }
          }
          setPollTick((tick) => tick + 1);
        },
      );
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [client, options.exhibitionId, pollIntervalMs, pollTick, state.status, state.run?.runId]);

  /* 进入沙箱阶段（awaiting_capture/capturing/reviewing/succeeded）时按顺序准备展示图；
     最新运行失败/取消时退回 currentSceneRun，让当前采用场景仍可预览。
     无可准备的运行或快照照片缺失时必须清掉准备中标记——否则舞台会一直停在
     “正在准备沙箱展示图”（UI-03：取消后无已采用场景时卡住直到关页）。 */
  useEffect(() => {
    if (!shouldPrepareScenePhotos(options.visible !== false, state.status)) {
      setIsPreparingPhotos(false);
      return;
    }
    const run = scenePreparationTarget(state, options.currentRun, options.dismissedCandidateId);
    if (run === null) {
      setIsPreparingPhotos(false);
      return;
    }
    if (displayPhotos !== null && displayPhotos.runId === run.runId) return;
    const missing = run.photoIds.filter((photoId) => !options.photos.some((photo) => photo.id === photoId));
    if (missing.length > 0) {
      setIsPreparingPhotos(false);
      dispatch({ type: "run_failed", message: "运行快照里的照片已不存在，请重新生成场景。" });
      return;
    }
    const orderedSources = run.photoIds
      .map((photoId) => options.photos.find((photo) => photo.id === photoId))
      .filter((photo): photo is ScenePhotoSource => photo !== undefined);
    const controller = new AbortController();
    setIsPreparingPhotos(true);
    prepareDisplayPhotos(orderedSources, controller.signal).then(
      (photos) => {
        if (controller.signal.aborted) return;
        setIsPreparingPhotos(false);
        setDisplayPhotos({ runId: run.runId, photos });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setIsPreparingPhotos(false);
        dispatch({ type: "run_failed", message: describeSceneError(error) });
      },
    );
    return () => {
      controller.abort();
    };
  }, [displayPhotos, options.currentRun, options.dismissedCandidateId, options.photos, options.visible, state.run, state.status]);

  const generate = useCallback(
    (hint: string): void => {
      const trimmed = hint.trim();
      const normalizedHint = trimmed.length === 0 ? null : trimmed.slice(0, SCENE_HINT_MAX_LENGTH);
      terminalRef.current = false;
      submittedKeyRef.current = null;
      captureStartedKeyRef.current = null;
      setIsActionPending(true);
      client.generateScene(options.exhibitionId, normalizedHint).then(
        (run) => {
          setIsActionPending(false);
          setDisplayPhotos(null);
          dispatch({ type: "reset", run });
        },
        (error: unknown) => {
          setIsActionPending(false);
          dispatch({ type: "run_failed", message: describeSceneError(error) });
        },
      );
    },
    [client, options.exhibitionId],
  );

  const cancel = useCallback((): void => {
    const run = state.run;
    if (run === null || !isActiveStatus(state.status)) return;
    setIsActionPending(true);
    client.cancelScene(run.runId).then(
      (updated) => {
        setIsActionPending(false);
        terminalRef.current = true;
        setDisplayPhotos(null);
        dispatch({ type: "run_updated", run: updated });
      },
      (error: unknown) => {
        setIsActionPending(false);
        if (terminalRef.current) {
          return;
        }
        dispatch({ type: "run_failed", message: describeSceneError(error) });
      },
    );
  }, [client, state.run, state.status]);

  const reloadRun = useCallback((): void => {
    terminalRef.current = false;
    submittedKeyRef.current = null;
    captureStartedKeyRef.current = null;
    dispatch({ type: "load_started" });
    client.getSceneRun(options.exhibitionId).then(
      (run) => acceptRun(run),
      (error: unknown) => {
        if (terminalRef.current) {
          return;
        }
        if (error instanceof ApiError && error.code === "NOT_FOUND") {
          dispatch({ type: "run_loaded", run: null });
          return;
        }
        dispatch({ type: "run_failed", message: describeSceneError(error) });
      },
    );
  }, [client, options.exhibitionId]);

  const retryCapture = useCallback((): void => {
    terminalRef.current = false;
    submittedKeyRef.current = null;
    captureStartedKeyRef.current = null;
    setDisplayPhotos(null);
    dispatch({ type: "capture_retry" });
  }, []);

  const reportCaptureStarted = useCallback((): void => {
    const run = state.run;
    if (run !== null) {
      captureStartedKeyRef.current = captureSubmitKey(run);
    }
    dispatch({ type: "capture_started" });
  }, [state.run]);

  const reportRenderFailure = useCallback((message: string): void => {
    if (terminalRef.current) {
      return;
    }
    captureStartedKeyRef.current = null;
    dispatch({ type: "run_failed", message });
  }, []);

  /** 回传评审（截图成功或代码崩溃都走这里）；同一 run 的同一轮 attempts 只提交一次。 */
  const submitReview = useCallback(
    (captures: readonly string[], runtime: SceneRuntimeEvidence): void => {
      const run = state.run;
      if (run === null) {
        return;
      }
      const key = captureSubmitKey(run);
      // 点击“开始截图”的同步标记优先：截图回调可能早于 React 提交 capturing 状态（首次加载/revise 首次截图），
      // 此时不能用闭包里的旧 awaiting_capture 丢弃它；若没开始过截图则必须拒绝（旧 attempts 的迟到事件）。
      const startedForKey = captureStartedKeyRef.current === key;
      if (!canSubmitCapture(state.status, startedForKey)) {
        return;
      }
      if (submittedKeyRef.current === key) {
        return;
      }
      submittedKeyRef.current = key;
      dispatch({ type: "capture_completed" });
      client
        .reviewScene({ runId: run.runId, captures, runtime })
        .then(
          (updated) => acceptRun(updated),
          (error: unknown) => {
            if (terminalRef.current) {
              return;
            }
            dispatch({ type: "run_failed", message: describeSceneError(error) });
          },
        );
    },
    [client, state.run, state.status],
  );

  const submitCapture = useCallback(
    (message: CapturesMessage): void =>
      submitReview(
        message.images.map((image) => image.dataUrl),
        toSceneRuntimeEvidence(message.runtime),
      ),
    [submitReview],
  );

  const submitCodeFailure = useCallback(
    (evidence: SceneRuntimeEvidence): void => submitReview([], evidence),
    [submitReview],
  );

  return {
    state,
    displayPhotos,
    isPreparingPhotos,
    isActionPending,
    captureViews,
    generate,
    cancel,
    retryCapture,
    reloadRun,
    submitCapture,
    submitCodeFailure,
    reportCaptureStarted,
    reportRenderFailure,
  };
};
