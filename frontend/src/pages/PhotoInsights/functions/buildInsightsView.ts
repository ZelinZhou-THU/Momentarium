import type { PhotoInsightsResponse } from "../../../objects/curation/PhotoInsightsResponse";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { PhotoView } from "../../../objects/gallery/PhotoView";
import type { CueCount, InsightChapter, InsightPhoto, InsightsView } from "../objects/PhotoInsightsState";

const PALETTE_LIMIT = 12;
const CUE_LIMIT = 12;

/** 计数并按次数降序；次数相同保持首次出现顺序（Array.prototype.sort 是稳定排序）。 */
const countByFirstSeen = (values: readonly string[]): readonly CueCount[] =>
  values
    .reduce<readonly CueCount[]>(
      (counts, value) =>
        counts.some((item) => item.cue === value)
          ? counts.map((item) => (item.cue === value ? { cue: item.cue, count: item.count + 1 } : item))
          : [...counts, { cue: value, count: 1 }],
      [],
    )
    .slice()
    .sort((left, right) => right.count - left.count);

const distinct = (values: readonly string[]): readonly string[] =>
  values.filter((value, index) => values.indexOf(value) === index);

const nonEmpty = (values: readonly string[]): readonly string[] =>
  values.map((value) => value.trim()).filter((value) => value !== "");

/** getexhibition 的照片结构 + getphotoinsights 的解读 → 页面视图模型（纯函数）。 */
export const buildInsightsView = (
  detail: Pick<ExhibitionDetail, "title" | "groups" | "ungroupedPhotos">,
  insights: PhotoInsightsResponse,
): InsightsView => {
  const analysisById = new Map(insights.analyses.map((item) => [item.photoId, item.analysis]));
  const toInsight = (photo: PhotoView): InsightPhoto => ({ photo, analysis: analysisById.get(photo.id) ?? null });

  const chapters: readonly InsightChapter[] = [
    ...[...detail.groups]
      .sort((left, right) => left.position - right.position)
      .map((group) => ({ key: group.id, title: group.title, photos: group.photos.map(toInsight) })),
    ...(detail.ungroupedPhotos.length === 0
      ? []
      : [{ key: "__ungrouped", title: null, photos: detail.ungroupedPhotos.map(toInsight) }]),
  ];

  const analyses = chapters
    .flatMap((chapter) => chapter.photos)
    .flatMap((item) => (item.analysis === null ? [] : [item.analysis]));

  return {
    exhibitionTitle: detail.title,
    chapters,
    analyzedCount: analyses.length,
    totalCount: chapters.reduce((total, chapter) => total + chapter.photos.length, 0),
    moods: distinct(nonEmpty(analyses.map((analysis) => analysis.mood))),
    palette: countByFirstSeen(analyses.flatMap((analysis) => analysis.palette.map((color) => color.toUpperCase())))
      .slice(0, PALETTE_LIMIT)
      .map((item) => item.cue),
    cues: countByFirstSeen(nonEmpty(analyses.flatMap((analysis) => analysis.memoryCues))).slice(0, CUE_LIMIT),
    latestBrief: insights.latestBrief,
  };
};
