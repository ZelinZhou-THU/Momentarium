import { AuthorizedPhotoThumb } from "../../../components/AuthorizedPhotoThumb";
import { photoLabel } from "../../../objects/gallery/photoLabel";
import type { InsightPhoto } from "../objects/PhotoInsightsState";
import { PaletteStrip } from "../../../components/ui";

export interface PhotoInsightCardProps {
  readonly item: InsightPhoto;
}

/** 单张照片卡：缩略图 + AI 解读；尚未解读时给出说明而不是空白。 */
export function PhotoInsightCard({ item }: PhotoInsightCardProps) {
  const { photo, analysis } = item;
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="aspect-video w-full">
        <AuthorizedPhotoThumb url={photo.thumbUrl} alt={photoLabel(photo)} />
      </div>
      <div className="p-4">
        {analysis === null ? (
          <p className="text-caption text-muted">这张照片还没有被 AI 解读。</p>
        ) : (
          <>
            <p className="text-caption text-accent">{analysis.mood}</p>
            <p className="mt-2 text-body text-ink">{analysis.description}</p>
            {analysis.memoryCues.length === 0 ? null : (
              <p className="mt-2 text-caption text-muted">记忆线索：{analysis.memoryCues.join("、")}</p>
            )}
            {analysis.sensory === "" ? null : <p className="mt-1 text-caption text-muted">感官：{analysis.sensory}</p>}
            <div className="mt-3">
              <PaletteStrip colors={analysis.palette} label="这张照片的主色" swatchClassName="h-4 w-4" />
            </div>
            {analysis.suggestedCaption === "" ? null : (
              <p className="mt-3 border-l-2 border-accent pl-3 font-serif text-caption text-ink">
                {analysis.suggestedCaption}
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
