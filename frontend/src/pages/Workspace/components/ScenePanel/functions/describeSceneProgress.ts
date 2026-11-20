import type { SceneRunView } from "../../../../../objects/gallery/SceneRunView";
import type { ScenePanelStatus } from "../objects/ScenePanelState";
import { isActiveStatus } from "./reduceScenePanel";

/**
 * 轮询超过这个时长视为"比平时久"：不判失败（spec 不设产品级超时，后端有 30 分钟看门狗），
 * 只降低轮询频率并提示用户可以继续等或停止生成。
 */
export const SCENE_SLOW_POLL_AFTER_MS = 180_000;
/** "比平时久"之后的轮询间隔。 */
export const SCENE_SLOW_POLL_INTERVAL_MS = 10_000;

/** 下一次轮询的等待时长：前 3 分钟用基础间隔，之后放慢。 */
export const scenePollDelayMs = (pollingForMs: number, baseIntervalMs: number): number =>
  pollingForMs > SCENE_SLOW_POLL_AFTER_MS
    ? Math.max(baseIntervalMs, SCENE_SLOW_POLL_INTERVAL_MS)
    : baseIntervalMs;

/** 时长文案：45 秒 / 3 分 05 秒 / 1 小时 02 分。 */
export const formatSceneDuration = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours} 小时 ${pad(minutes)} 分`
    : minutes > 0
      ? `${minutes} 分 ${pad(seconds)} 秒`
      : `${seconds} 秒`;
};

const parseInstant = (value: string): number | null => {
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
};

/** 运行已持续的毫秒数（以服务端 createdAt 为起点，刷新页面不归零）；时间无法解析时为 null。 */
export const sceneRunElapsedMs = (run: SceneRunView, nowMs: number): number | null => {
  const createdAt = parseInstant(run.createdAt);
  return createdAt === null ? null : nowMs - createdAt;
};

/** 计时中的阶段：可取消的运行状态 + 本地的 capturing（渲染截图中，运行仍在进行）。 */
export const isSceneTimedStatus = (status: ScenePanelStatus): boolean =>
  isActiveStatus(status) || status === "capturing";

export interface SceneProgressView {
  /** "已用 1 分 20 秒"（进行中）/ "用时 2 分 03 秒"（完成）；无可用时间时为 null。 */
  readonly elapsedLabel: string | null;
  /** "第 1 次修订"；首次生成为 null。 */
  readonly attemptLabel: string | null;
  /** 可取消的运行阶段且已超过 SCENE_SLOW_POLL_AFTER_MS。 */
  readonly isLongRunning: boolean;
}

/** 面板状态 + 运行 + 当前时刻 → 计时与修订轮次文案（纯函数，nowMs 由调用方注入）。 */
export const describeSceneProgress = (
  status: ScenePanelStatus,
  run: SceneRunView | null,
  nowMs: number,
): SceneProgressView => {
  if (run === null) {
    return { elapsedLabel: null, attemptLabel: null, isLongRunning: false };
  }
  const attemptLabel = run.attempts > 0 ? `第 ${run.attempts} 次修订` : null;

  if (isSceneTimedStatus(status)) {
    const elapsed = sceneRunElapsedMs(run, nowMs);
    return {
      elapsedLabel: elapsed === null ? null : `已用 ${formatSceneDuration(elapsed)}`,
      attemptLabel,
      // 提示里会建议「停止生成」，所以只在可取消的阶段给出（本地 capturing 阶段没有停止按钮）。
      isLongRunning: isActiveStatus(status) && elapsed !== null && elapsed > SCENE_SLOW_POLL_AFTER_MS,
    };
  }

  if (status === "succeeded") {
    const createdAt = parseInstant(run.createdAt);
    const updatedAt = parseInstant(run.updatedAt);
    return {
      elapsedLabel:
        createdAt === null || updatedAt === null
          ? null
          : `用时 ${formatSceneDuration(updatedAt - createdAt)}`,
      attemptLabel,
      isLongRunning: false,
    };
  }

  return { elapsedLabel: null, attemptLabel, isLongRunning: false };
};
