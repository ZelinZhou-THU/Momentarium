import type { SceneRunStatus } from "../../../objects/gallery/SceneRunView";
import type { SceneRunSummary } from "../../../objects/scene/SceneRunSummary";

export type RunTone = "success" | "active" | "muted";

export interface RunSummaryView {
  readonly statusLabel: string;
  readonly kindLabel: string;
  readonly sourceLabel: string | null;
  readonly scoreLabel: string | null;
  readonly attemptsLabel: string | null;
  readonly badges: readonly string[];
  readonly tone: RunTone;
}

const STATUS_LABELS: Record<SceneRunStatus, string> = {
  queued: "排队中",
  generating: "生成中",
  awaiting_capture: "等待截图",
  reviewing: "评审中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已停止",
};

const toneOf = (status: SceneRunStatus): RunTone =>
  status === "succeeded" ? "success" : status === "failed" || status === "cancelled" ? "muted" : "active";

/** 契约 v1.14 运行起因：生成 / 修订 / 恢复（与 source 产物来源独立）。 */
const KIND_LABELS = {
  generate: "生成",
  revise: "修订",
  restore: "恢复",
} as const;

/** 版本列表一行的展示文案（纯函数，不返回 JSX）。 */
export const describeRunSummary = (run: SceneRunSummary): RunSummaryView => ({
  statusLabel: STATUS_LABELS[run.status],
  kindLabel: KIND_LABELS[run.kind],
  sourceLabel: run.source === null ? null : run.source === "ai" ? "AI 生成" : "兜底场景",
  scoreLabel: run.weightedScore === null ? null : `${run.weightedScore.toFixed(2)} 分`,
  attemptsLabel: run.attempts > 0 ? `修订 ${run.attempts} 次` : null,
  badges: [
    ...(run.isCurrent ? ["当前场景"] : []),
    ...(run.acceptable && !run.isCurrent ? ["修订候选 · 可采用"] : []),
    ...(run.dismissed && !run.isCurrent ? ["已放弃 · 不再提示"] : []),
    ...(run.kind === "revise" && run.parentRunId !== null && !run.isCurrent ? ["基于上一版本"] : []),
    ...(run.restoredFrom !== null ? ["由旧版本恢复"] : []),
    ...(run.status === "succeeded" && !run.matchesCurrentDraft ? ["素材已变化"] : []),
  ],
  tone: toneOf(run.status),
});
