import { useEffect, useState } from "react";
import { Button, ErrorState, Spinner } from "../../../components/ui";
import type { SceneRunSummary } from "../../../objects/scene/SceneRunSummary";
import { describeReviewIssue } from "../../../scene/functions/describeReviewIssue";
import { SceneSandbox } from "../../../scene/sandbox";
import { describeRunSummary } from "../functions/describeRunSummary";
import type { PreviewPhotosState, VersionPreviewState } from "../objects/SceneVersionsState";


export interface RunDetailProps {
  readonly summary: SceneRunSummary;
  readonly preview: VersionPreviewState;
  /** 稳定引用：沙箱 effect 依赖 photos，引用变化会重建 iframe。 */
  readonly photos: PreviewPhotosState;
  readonly onRestore: () => void;
  readonly onAccept: () => void;
  readonly accepting: boolean;
  readonly acceptError: string | null;
}

/** 右栏：沙箱预览（只浏览不截图，渲染失败给出说明）+ 采用修订/恢复按钮 + 评审摘要与意见 + 题面。 */
export function RunDetail({
  summary,
  preview,
  photos,
  onRestore,
  onAccept,
  accepting,
  acceptError,
}: RunDetailProps) {
  const [failure, setFailure] = useState<string | null>(null);
  const previewRunId = preview.status === "ready" ? preview.run.runId : null;
  const view = describeRunSummary(summary);

  useEffect(() => setFailure(null), [previewRunId]);

  return (
    <section className="flex min-w-0 flex-col gap-6" aria-label="版本详情">
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-night">
        {preview.status === "loading" || photos.status === "loading" ? (
          <div className="flex h-full items-center justify-center">
            <Spinner tone="inverse" label="正在载入场景" />
          </div>
        ) : preview.status === "error" ? (
          <div className="p-6">
            <ErrorState message={preview.message} />
          </div>
        ) : photos.status === "unavailable" ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-caption text-surface/70">{photos.message}</p>
        ) : failure !== null ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-caption text-surface/70">{failure}</p>
        ) : preview.status === "ready" && preview.run.code !== null ? (
          <SceneSandbox
            key={preview.run.runId}
            code={preview.run.code}
            photos={photos.photos}
            runId={`history-${preview.run.runId}`}
            sessionLimitMs={null}
            className="h-full w-full"
            onFailure={(sceneFailure) => setFailure(`这个版本无法在浏览器中渲染：${sceneFailure.message}`)}
          />
        ) : (
          <p className="flex h-full items-center justify-center text-caption text-surface/70">这次运行没有可预览的场景</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {view.badges.map((badge) => (
          <span key={badge} className="rounded-md bg-accentSoft px-2 py-1 text-micro text-accent">
            {badge}
          </span>
        ))}
        <span className="text-caption text-muted">{view.kindLabel}运行 · 运行 {summary.runId.slice(0, 8)}</span>
        {summary.parentRunId === null ? null : (
          <span className="text-caption text-muted">父版本 {summary.parentRunId.slice(0, 8)}</span>
        )}
      </div>

      {preview.status === "ready" && preview.run.revisionInstruction !== null ? (
        <p className="whitespace-pre-wrap rounded-md border border-line bg-surface px-4 py-3 text-caption text-ink">
          修订要求：{preview.run.revisionInstruction}
        </p>
      ) : null}

      {summary.acceptable && !summary.isCurrent ? (
        <div className="flex flex-col gap-2">
          <Button onClick={onAccept} loading={accepting}>
            采用这次修订
          </Button>
          <p className="text-caption text-muted">
            采用只切换草稿的当前场景；公开页需要重新发布后才会变化。
          </p>
          {acceptError === null ? null : <p className="text-caption text-danger">{acceptError}</p>}
        </div>
      ) : null}

      {summary.restorable && !summary.isCurrent ? (
        <div>
          <Button onClick={onRestore}>恢复为当前场景</Button>
        </div>
      ) : null}

      {summary.errorMessage === null ? null : <p className="text-caption text-danger">{summary.errorMessage}</p>}

      {preview.status === "ready" && preview.run.review !== null ? (
        <div>
          <h2 className="text-h2">评审</h2>
          <p className="mt-2 text-body text-ink">{preview.run.review.summary}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {preview.run.review.issues.map((issue) => {
              const view = describeReviewIssue(issue);
              return (
                <li key={issue} className="rounded-md border border-line bg-bg px-3 py-2">
                  {view.dimension !== null || view.location !== null ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {view.dimension !== null ? (
                        <span className="rounded-md bg-accentSoft px-2 text-micro text-accent">{view.dimension}</span>
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

      {preview.status === "ready" && preview.run.brief !== null ? (
        <details className="rounded-md border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-body text-ink">题面：{preview.run.brief.mood}</summary>
          <p className="mt-2 text-caption text-muted">{preview.run.brief.memoryReading}</p>
          <p className="mt-2 whitespace-pre-wrap text-caption text-muted">{preview.run.brief.scenePrompt}</p>
        </details>
      ) : null}
    </section>
  );
}
