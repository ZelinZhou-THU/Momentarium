import type { PhotoInsightsResponse } from "../../../objects/curation/PhotoInsightsResponse";

/** 照片 id → AI 建议图注（只收非空的）；记忆档案里已有的解读，策展时可以直接拿来当图注。 */
export type CaptionSuggestions = ReadonlyMap<string, string>;

export const NO_CAPTION_SUGGESTIONS: CaptionSuggestions = new Map();

export const buildCaptionSuggestions = (insights: PhotoInsightsResponse): CaptionSuggestions =>
  new Map(
    insights.analyses
      .map((view): readonly [string, string] => [view.photoId, view.analysis.suggestedCaption.trim()])
      .filter(([, caption]) => caption.length > 0),
  );

/** 只在这张照片还没有图注、且有建议时才提供「采用建议图注」，绝不覆盖作者已经写的图注。 */
export const captionSuggestionFor = (
  suggestions: CaptionSuggestions,
  photoId: string,
  currentCaption: string,
): string | null =>
  currentCaption.trim().length > 0 ? null : (suggestions.get(photoId) ?? null);
