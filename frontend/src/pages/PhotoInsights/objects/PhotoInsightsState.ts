import type { PhotoAnalysis } from "../../../objects/curation/PhotoInsightsResponse";
import type { PhotoView } from "../../../objects/gallery/PhotoView";
import type { SceneBrief } from "../../../objects/gallery/SceneBrief";

export interface InsightPhoto {
  readonly photo: PhotoView;
  readonly analysis: PhotoAnalysis | null;
}

export interface InsightChapter {
  /** 渲染用稳定 key：章节 id，未分组为 "__ungrouped"（章节标题可能重复）。 */
  readonly key: string;
  /** null 表示「未分组」。 */
  readonly title: string | null;
  readonly photos: readonly InsightPhoto[];
}

export interface CueCount {
  readonly cue: string;
  readonly count: number;
}

export interface InsightsView {
  readonly exhibitionTitle: string;
  readonly chapters: readonly InsightChapter[];
  readonly analyzedCount: number;
  readonly totalCount: number;
  readonly moods: readonly string[];
  readonly palette: readonly string[];
  readonly cues: readonly CueCount[];
  readonly latestBrief: SceneBrief | null;
}

/** 页面状态：loading / ready / error；没有任何分析也是 ready（由 analyzedCount 区分展示）。 */
export type PhotoInsightsState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly view: InsightsView }
  | { readonly status: "error"; readonly message: string };
