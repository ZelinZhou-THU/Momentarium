import type { InsightsView } from "../objects/PhotoInsightsState";
import { ColorSwatch } from "../../../components/ui";

export interface InsightsSummaryProps {
  readonly view: InsightsView;
}

/** 汇总：已解读张数、整体情绪、合并色板、高频记忆线索。 */
export function InsightsSummary({ view }: InsightsSummaryProps) {
  return (
    <section className="rounded-xl border border-line bg-surface p-6" aria-label="整体解读">
      <p className="text-caption text-muted">
        已解读 {view.analyzedCount} / {view.totalCount} 张照片
      </p>

      {view.moods.length === 0 ? null : (
        <div className="mt-4">
          <h2 className="text-h2 text-ink">这组照片的情绪</h2>
          <p className="mt-2 text-body text-ink">{view.moods.join(" · ")}</p>
        </div>
      )}

      {view.palette.length === 0 ? null : (
        <div className="mt-6">
          <h2 className="text-h2 text-ink">色彩</h2>
          <ul className="mt-3 flex flex-wrap gap-3" aria-label="合并色板">
            {view.palette.map((color) => (
              <li key={color} className="flex flex-col items-center gap-1">
                <ColorSwatch color={color} className="h-10 w-10 border border-line" />
                <span className="text-micro text-muted">{color}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.cues.length === 0 ? null : (
        <div className="mt-6">
          <h2 className="text-h2 text-ink">反复出现的记忆线索</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {view.cues.map((item) => (
              <li key={item.cue} className="rounded-md bg-accentSoft px-3 py-1 text-caption text-ink">
                {item.cue}
                {item.count > 1 ? <span className="ml-1 text-muted">×{item.count}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
