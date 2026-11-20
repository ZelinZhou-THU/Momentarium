import { classNames } from "../../../components/ui/classNames";
import { staggerDelay } from "../../../motion/stagger";
import type { SceneRunSummary } from "../../../objects/scene/SceneRunSummary";
import { describeRunSummary } from "../functions/describeRunSummary";
import { formatRunTime } from "../functions/formatRunTime";

export interface RunListProps {
  readonly runs: readonly SceneRunSummary[];
  readonly selectedRunId: string | null;
  readonly onSelect: (runId: string) => void;
}

/** 左栏：每次运行一行（时间、状态、来源、分数、徽标），点击切换右栏预览；各行逐项上浮进场。 */
export function RunList({ runs, selectedRunId, onSelect }: RunListProps) {
  return (
    <ol className="flex flex-col gap-2" aria-label="场景版本">
      {runs.map((run, index) => {
        const view = describeRunSummary(run);
        const selected = run.runId === selectedRunId;
        return (
          <li key={run.runId} style={{ animationDelay: staggerDelay(index) }} className="animate-rise-in motion-reduce:animate-none">
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(run.runId)}
              className={classNames(
                "w-full rounded-md border px-4 py-3 text-left transition-colors duration-150 ease-out motion-reduce:transition-none",
                selected ? "border-accent bg-surface" : "border-line bg-bg hover:bg-surface",
                view.tone === "muted" ? "text-muted" : "text-ink",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-body">{formatRunTime(run.createdAt)}</span>
                <span className="text-caption">{view.statusLabel}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-caption text-muted">
                <span>{view.kindLabel}</span>
                {view.sourceLabel === null ? null : <span>{view.sourceLabel}</span>}
                {view.scoreLabel === null ? null : <span>{view.scoreLabel}</span>}
                {view.attemptsLabel === null ? null : <span>{view.attemptsLabel}</span>}
              </div>
              {run.revisionInstruction === null ? null : (
                <p className="mt-1 line-clamp-2 text-caption text-ink">修订：{run.revisionInstruction}</p>
              )}
              {run.mood === null ? null : <p className="mt-1 truncate text-caption text-muted">{run.mood}</p>}
              {view.badges.length === 0 ? null : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {view.badges.map((badge) => (
                    <span key={badge} className="rounded-md bg-accentSoft px-2 text-micro text-accent">
                      {badge}
                    </span>
                  ))}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
