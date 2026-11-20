import { describeSceneProgress, isSceneTimedStatus } from "../functions/describeSceneProgress";
import { describeSceneStage } from "../functions/describeSceneStage";
import type { ScenePanelState } from "../objects/ScenePanelState";
import { useNow } from "../hooks/useNow";

const STEP_LABELS = ["题面", "代码", "渲染", "评审"] as const;

/**
 * 场景生成阶段进度条：题面 → 代码 → 渲染 → 评审；文字随状态变化（spec §11.5）。
 * 右侧显示已用时间（以服务端 createdAt 为起点）与修订轮次；超过 3 分钟提示"比平时久"。
 */
export function SceneStageTimeline({ state }: { readonly state: ScenePanelState }) {
  const stage = describeSceneStage(state);
  const now = useNow(isSceneTimedStatus(state.status));
  const progress = describeSceneProgress(state.status, state.run, now);
  const meta = [progress.attemptLabel, progress.elapsedLabel].filter(
    (label): label is string => label !== null,
  );
  return (
    <div className="mt-6 rounded-xl border border-line bg-bg px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="场景生成阶段">
          {STEP_LABELS.map((label, index) => {
            const step = index + 1;
            const isCurrent = stage.step === step;
            const isDone = stage.step > step;
            const badgeClass = isCurrent
              ? "bg-accent text-surface"
              : isDone
                ? "bg-accentSoft text-accent"
                : "border border-line text-muted";
            const labelClass = isCurrent ? "text-accent" : isDone ? "text-ink" : "text-muted";
            return (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-micro ${badgeClass}`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {step}
                </span>
                <span className={`text-caption ${labelClass}`}>{label}</span>
                {index < STEP_LABELS.length - 1 ? <span className="text-line">/</span> : null}
              </li>
            );
          })}
        </ol>
        {meta.length > 0 ? (
          <p className="text-caption tabular-nums text-muted">{meta.join(" · ")}</p>
        ) : null}
      </div>
      <p className="mt-3 text-body text-ink">{stage.title}</p>
      <p className="mt-1 text-caption text-muted">{stage.description}</p>
      {progress.isLongRunning ? (
        <p className="mt-2 text-caption text-accent">
          这次比平时久：AI 仍在生成，可以继续等待，或用「停止生成」结束本次运行。
        </p>
      ) : null}
    </div>
  );
}
