import type { SceneRunSummary } from "../../../objects/scene/SceneRunSummary";
import type { VersionsListState } from "../objects/SceneVersionsState";

export const buildVersionsListState = (runs: readonly SceneRunSummary[]): VersionsListState =>
  runs.length === 0 ? { status: "empty" } : { status: "ready", runs };

/** 进入页面时默认选中：当前版本 → 可采用的修订候选 → 第一条成功运行 → 第一条。 */
export const initialSelection = (runs: readonly SceneRunSummary[]): string | null =>
  (runs.find((run) => run.isCurrent) ??
    runs.find((run) => run.acceptable) ??
    runs.find((run) => run.status === "succeeded") ??
    runs[0])?.runId ?? null;

/** 实际选中项：用户选过且仍在列表中就用它，否则回到默认选中（恢复后新运行在列表刷新到达前暂不在列表中）。 */
export const effectiveSelection = (runs: readonly SceneRunSummary[], chosenRunId: string | null): string | null =>
  chosenRunId !== null && runs.some((run) => run.runId === chosenRunId) ? chosenRunId : initialSelection(runs);
