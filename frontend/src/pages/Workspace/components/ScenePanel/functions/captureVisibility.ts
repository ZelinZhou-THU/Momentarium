import type { ScenePanelStatus } from "../objects/ScenePanelState";

/** 需要截图并回传评审的运行阶段：awaiting_capture 由沙箱渲染+截图推进。 */
export const isCaptureStatus = (status: ScenePanelStatus): boolean => status === "awaiting_capture";

/**
 * 可见性门控（P1 修复）：面板或页面不可见时，跨源 iframe 的 rAF 会被浏览器节流，
 * SceneRuntime 采样 fps≈0，提交 reviewscene 必然被硬门禁拒绝（白白消耗修订/兜底）。
 * 因此 awaiting_capture 时若不可见，先暂缓自动截图与评审。
 */
export const shouldDeferCapture = (
  status: ScenePanelStatus,
  panelVisible: boolean,
  documentVisible: boolean,
): boolean => isCaptureStatus(status) && (!panelVisible || !documentVisible);

/**
 * 是否已具备挂载沙箱并截图的时机：awaiting_capture + 可见 + 可见后已等 1–2 帧（captureArmed）。
 * 等帧是为了让 iframe 恢复调度、fps 采样恢复正常后再截图。
 */
export const canStartCapture = (
  status: ScenePanelStatus,
  captureArmed: boolean,
  panelVisible: boolean,
  documentVisible: boolean,
): boolean =>
  isCaptureStatus(status) && captureArmed && panelVisible && documentVisible;

/** 帧数不足（fps 为空或 0）时，自动重新截图的次数上限；超过后照常提交，由服务端门禁判定。 */
export const MAX_FRAME_STARVED_RETRIES = 2;

/**
 * 帧率采样不足：沙箱里 rAF 被浏览器节流（后台、被遮挡、窗口失焦等）时 fps 采到 null/0，
 * 此时提交评审必然被硬门禁拒绝并白白消耗修订次数，应先重新截图。captureAttempt 是已重试次数。
 */
export const shouldRetryFrameStarvedCapture = (
  fps: number | null,
  captureAttempt: number,
): boolean => (fps === null || fps <= 0) && captureAttempt < MAX_FRAME_STARVED_RETRIES;

/**
 * 截图轮次键（runId + attempts + captureAttempt）：用于判断“这一轮是否已真正开始过截图”。
 * revise 回到 awaiting_capture 后键会变化，沙箱未重挂/未开始截图时看门狗可据此自动补触发一次。
 */
export const captureStartKey = (
  run: { readonly runId: string; readonly attempts: number },
  captureAttempt: number,
): string => `${run.runId}:${run.attempts}:${captureAttempt}`;
