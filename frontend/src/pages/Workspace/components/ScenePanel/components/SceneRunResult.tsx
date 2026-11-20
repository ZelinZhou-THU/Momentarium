import { Button } from "../../../../../components/ui";
import { describeReviewIssue, reviewIssuesHeading } from "../../../../../scene/functions/describeReviewIssue";
import { RUBRIC_LABELS } from "../../../../../scene/objects/ReviewRubric";
import type { ScenePanelState } from "../objects/ScenePanelState";

export interface SceneRunResultProps {
  readonly state: ScenePanelState;
  readonly onRegenerate: () => void;
  readonly onRetryCapture: () => void;
  readonly onReload: () => void;
}

const verdictText = (verdict: "pass" | "revise"): string => (verdict === "pass" ? "评审通过" : "需要修订");

/** 场景结果区：成功展示五维评分/issues/summary；失败/取消/错误给出原因与下一步动作。 */
export function SceneRunResult({ state, onRegenerate, onRetryCapture, onReload }: SceneRunResultProps) {
  const run = state.run;

  if (state.status === "succeeded" && run !== null && run.review !== null) {
    const review = run.review;
    return (
      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-serif text-h2 text-ink">评审结果</h3>
          <span
            className={`rounded-md px-3 py-1 text-caption ${
              review.verdict === "pass" ? "bg-accentSoft text-accent" : "bg-surface text-danger"
            }`}
          >
            {verdictText(review.verdict)} · {run.source === "fallback" ? "兜底场景" : "AI 场景"} · 第 {run.attempts + 1} 次尝试
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {RUBRIC_LABELS.map((item) => {
            const score = review.scores[item.key];
            return (
              <div key={item.key} className="rounded-md border border-line bg-bg px-3 py-2">
                <dt className="text-micro text-muted">{item.label}</dt>
                <dd className="mt-1 text-h2 text-ink">{score}/5</dd>
                <p className="text-micro text-muted">权重 {Math.round(item.weight * 100)}%</p>
              </div>
            );
          })}
        </dl>

        <p className="mt-4 text-body text-ink">{review.summary}</p>
        {review.issues.length > 0 ? (
          <div className="mt-4">
            <p className="text-caption text-muted">{reviewIssuesHeading(review.verdict)}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {review.issues.map((issue) => {
                const view = describeReviewIssue(issue);
                return (
                  <li key={issue} className="rounded-md border border-line bg-bg px-3 py-2">
                    {view.dimension !== null || view.location !== null ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {view.dimension !== null ? (
                          <span className="rounded-md bg-accentSoft px-2 py-0.5 text-micro text-accent">{view.dimension}</span>
                        ) : null}
                        {view.location !== null ? <span className="text-micro text-muted">{view.location}</span> : null}
                      </div>
                    ) : null}
                    <p className="mt-1 text-caption text-ink">{view.suggestion}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onRegenerate}>
            重新生成
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "failed" && run !== null) {
    return (
      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <h3 className="font-serif text-h2 text-ink">场景生成失败</h3>
        <p className="mt-2 text-body text-muted">{run.errorMessage ?? state.message ?? "生成失败，可重试。"}</p>
        {run.errorCode !== null ? <p className="mt-1 text-micro text-muted">错误码：{run.errorCode}</p> : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onReload}>
            刷新状态
          </Button>
          <Button onClick={onRegenerate}>重新生成</Button>
        </div>
      </div>
    );
  }

  if (state.status === "cancelled") {
    return (
      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <h3 className="font-serif text-h2 text-ink">已停止生成</h3>
        <p className="mt-2 text-body text-muted">本次场景生成已取消，可以重新生成。</p>
        <div className="mt-4">
          <Button onClick={onRegenerate}>重新生成</Button>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    const canRetryCapture = run !== null && run.status === "awaiting_capture";
    return (
      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <h3 className="font-serif text-h2 text-ink">场景操作失败</h3>
        <p className="mt-2 text-body text-danger">{state.message ?? "请求失败，请稍后重试。"}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {canRetryCapture ? (
            <Button variant="secondary" onClick={onRetryCapture}>
              重试渲染截图
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onReload}>
            刷新状态
          </Button>
          <Button onClick={onRegenerate}>重新生成</Button>
        </div>
      </div>
    );
  }

  return null;
}
