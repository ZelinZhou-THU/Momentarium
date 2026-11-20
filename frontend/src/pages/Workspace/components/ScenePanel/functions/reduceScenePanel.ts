import type { SceneRunStatus } from "../../../../../objects/gallery/SceneRunView";
import type { SceneRunView } from "../../../../../objects/gallery/SceneRunView";
import type { ScenePanelEvent, ScenePanelState, ScenePanelStatus } from "../objects/ScenePanelState";

/** 后端运行状态 → 面板状态（运行状态是面板状态的子集）。 */
export const statusFromRunStatus = (status: SceneRunStatus): SceneRunStatus => {
  switch (status) {
    case "queued":
      return "queued";
    case "generating":
      return "generating";
    case "awaiting_capture":
      return "awaiting_capture";
    case "reviewing":
      return "reviewing";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
};

export const createInitialScenePanelState = (initialRun: SceneRunView | null | undefined): ScenePanelState => {
  if (initialRun === undefined) {
    return { status: "loading", run: null, message: null, captureAttempt: 0 };
  }
  if (initialRun === null) {
    return { status: "idle", run: null, message: null, captureAttempt: 0 };
  }
  return { status: statusFromRunStatus(initialRun.status), run: initialRun, message: null, captureAttempt: 0 };
};

const ACTIVE_STATUSES: readonly ScenePanelStatus[] = ["queued", "generating", "awaiting_capture", "reviewing"];

/** 需要轮询 getscenerun 的状态（awaiting_capture 由沙箱截图推进，不轮询）。 */
export const isPollingStatus = (status: ScenePanelStatus): boolean =>
  status === "queued" || status === "generating" || status === "reviewing";

/** 运行尚未结束（可取消）。 */
export const isActiveStatus = (status: ScenePanelStatus): boolean =>
  ACTIVE_STATUSES.some((active) => active === status);

/** 本地截图进行中也必须保留当前运行的沙箱预览。 */
export const isPreviewActive = (status: ScenePanelStatus): boolean =>
  isActiveStatus(status) || status === "capturing" || status === "succeeded";

/**
 * 沙箱挂载时是否自动截图并回传评审：仅运行推进阶段需要。
 * succeeded 是评审通过后的实时预览（含整页刷新用 initialRun 恢复的场景）——若此时自动截图，
 * 会把已结束的 run 再次 reviewscene，后端返回 409「场景运行已结束，不能重复评审」。
 */
export const shouldAutoCaptureSandbox = (status: ScenePanelStatus): boolean =>
  status === "awaiting_capture" || status === "capturing" || status === "reviewing";

/** 需要准备沙箱展示图的面板状态（awaiting_capture/capturing/reviewing 截图与评审，succeeded 实时预览）。 */
const SANDBOX_STATUSES: readonly ScenePanelStatus[] = ["awaiting_capture", "capturing", "reviewing", "succeeded"];

/** 后台运行的截图和评审仍须准备图片；已完成的预览等场景分区可见时再准备。 */
export const shouldPrepareScenePhotos = (visible: boolean, status: ScenePanelStatus): boolean =>
  visible || status === "awaiting_capture" || status === "capturing" || status === "reviewing";

/**
 * 沙箱展示图的准备目标：面板处于沙箱阶段时用最新运行；最新运行不在沙箱阶段（生成中/失败/取消）
 * 时退回已采用的当前场景（须已成功且有代码），让当前场景仍可预览。
 * 返回 null 表示无任何可准备的运行——调用方必须清掉"正在准备沙箱展示图"的进行中标记
 * （UI-03：取消后无已采用场景时舞台曾一直卡在准备态）。
 */
export const scenePreparationTarget = (
  state: ScenePanelState,
  currentRun: SceneRunView | null | undefined,
  dismissedCandidateId?: string | null,
): SceneRunView | null => {
  if (state.run !== null && !state.run.dismissed && state.run.runId !== dismissedCandidateId && state.run.code !== null && SANDBOX_STATUSES.some((status) => status === state.status)) {
    return state.run;
  }
  return currentRun !== null &&
    currentRun !== undefined &&
    currentRun.status === "succeeded" &&
    currentRun.code !== null
    ? currentRun
    : null;
};

/**
 * 是否需要在进入 awaiting_capture 时重建沙箱（重新渲染 + 重新截图 + 再次 reviewscene）。
 * revise 路径后端会把 run 推回 awaiting_capture 并 attempts+1（部分后端实现只更新 review/updatedAt）：
 * 此时 runId 不变但 code/review 已更新，必须 bump captureAttempt 才会重建 SceneSandbox 并自动截图。
 * 首次加载（尚无 run）与同一 attempts+同一 updatedAt 的重复同步不 bump。
 */
const needsSandboxRestart = (state: ScenePanelState, run: SceneRunView): boolean =>
  statusFromRunStatus(run.status) === "awaiting_capture" &&
  state.run !== null &&
  (state.run.attempts !== run.attempts ||
    state.run.updatedAt !== run.updatedAt ||
    (state.status !== "awaiting_capture" &&
      state.status !== "capturing" &&
      state.status !== "reviewing"));

const withCaptureAttempt = (state: ScenePanelState, run: SceneRunView): number =>
  needsSandboxRestart(state, run) ? state.captureAttempt + 1 : state.captureAttempt;

export const reduceScenePanel = (state: ScenePanelState, event: ScenePanelEvent): ScenePanelState => {
  switch (event.type) {
    case "load_started":
      return { status: "loading", run: null, message: null, captureAttempt: 0 };
    case "run_loaded":
      return event.run === null
        ? { status: "idle", run: null, message: null, captureAttempt: 0 }
        : {
            status: statusFromRunStatus(event.run.status),
            run: event.run,
            message: null,
            captureAttempt: withCaptureAttempt(state, event.run),
          };
    case "run_updated":
      return {
        status: statusFromRunStatus(event.run.status),
        run: event.run,
        message: null,
        captureAttempt: withCaptureAttempt(state, event.run),
      };
    case "run_failed":
      return { status: "error", run: state.run, message: event.message, captureAttempt: state.captureAttempt };
    case "capture_started":
      return state.status !== "awaiting_capture" ? state : { status: "capturing", run: state.run, message: null, captureAttempt: state.captureAttempt };
    case "capture_completed":
      return state.status !== "capturing" ? state : { status: "reviewing", run: state.run, message: null, captureAttempt: state.captureAttempt };
    case "capture_retry":
      return state.run === null || state.status === "succeeded" || state.status === "cancelled" || state.status === "failed"
        ? state
        : { status: "awaiting_capture", run: state.run, message: null, captureAttempt: state.captureAttempt + 1 };
    case "completed":
      return {
        status: statusFromRunStatus(event.run.status),
        run: event.run,
        message: null,
        captureAttempt: state.captureAttempt,
      };
    case "reset":
      return createInitialScenePanelState(event.run);
  }
};

/**
 * 运行变化通知键（runId + status + attempts + updatedAt）：ScenePanel 用它去重，
 * 仅在运行推进/评审状态变化时通知页面静默刷新 detail（publication/sceneRun/sceneStale）。
 */
export const runChangeKey = (run: SceneRunView): string =>
  `${run.runId}:${run.status}:${run.attempts}:${run.updatedAt}`;

/** 必须有本轮开始标记；允许 React 尚未提交 capturing 状态时收到的快速回调。 */
export const canSubmitCapture = (status: ScenePanelStatus, startedForKey: boolean): boolean =>
  startedForKey && (status === "awaiting_capture" || status === "capturing");

/**
 * 评审提交去重键：同一 run 的同一轮只提交一次（retryCapture 会重置）。
 * 构建崩溃后的独立修复不增加 attempts，只会刷新 updatedAt；键里不带 updatedAt 时，修复版的评审会被当成
 * 重复提交丢掉，页面停在“正在渲染并截图”（11-01 录制发现）。
 */
export const captureSubmitKey = (run: SceneRunView): string => `${run.runId}:${run.attempts}:${run.updatedAt}`;
