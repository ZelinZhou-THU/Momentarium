import { ZoomablePhotoThumb } from "../../../../../components/ZoomablePhotoThumb";
import { versionedContributionImageUrl } from "../../../../../apis/gallery/contributionContent";
import type { ContributionSummary } from "../../../../../objects/gallery/Contribution";
import { describeMemoryTextChange } from "../functions/contributionManagement";
import type { AdoptedSnapshot } from "../functions/contributionManagement";

export interface PendingUpdateCompareProps {
  readonly contribution: ContributionSummary;
  readonly adopted: AdoptedSnapshot;
}

/**
 * 待确认更新的对照：左边是已经收进草稿的版本（讲述原文 + 草稿里的照片），
 * 右边是投稿者改过的最新版本，创建者看清改了什么再决定「更新到最新版」还是「保持当前版本」。
 */
export function PendingUpdateCompare({ contribution, adopted }: PendingUpdateCompareProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-ink">
        {describeMemoryTextChange(adopted.text, contribution.memoryText)}
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section aria-label="已采用的版本" className="flex flex-col gap-2 rounded-md border border-line bg-bg p-4">
          <h3 className="text-micro text-muted">当前已采用 · 第 {adopted.version} 版</h3>
          <div className="flex items-start gap-3">
            <ZoomablePhotoThumb
              thumbUrl={adopted.thumbUrl}
              fullUrl={adopted.contentUrl}
              alt={adopted.photoLabel}
              sizeClassName="h-16 w-16"
              caption={adopted.photoLabel}
            />
            <blockquote className="min-w-0 flex-1 border-l-2 border-line pl-3 font-serif text-caption text-ink">
              {adopted.text}
            </blockquote>
          </div>
          <p className="text-caption text-muted">当前草稿图注：{adopted.caption || "（无）"}</p>
          <p className="text-caption text-muted">当前草稿地点：{adopted.location === null ? "（无）" : `${adopted.location.name} · ${adopted.location.latitude ?? "无坐标"}${adopted.location.longitude === null ? "" : `, ${adopted.location.longitude}`}`}</p>
        </section>
        <section
          aria-label="投稿者的最新版本"
          className="flex flex-col gap-2 rounded-md border border-accent bg-surface p-4"
        >
          <h3 className="text-micro text-accent">投稿者最新 · 第 {contribution.version} 版</h3>
          <div className="flex items-start gap-3">
            {contribution.file === null ? null : (
              <ZoomablePhotoThumb
                thumbUrl={versionedContributionImageUrl(contribution.file.thumbUrl, contribution.version)}
                fullUrl={versionedContributionImageUrl(contribution.file.contentUrl, contribution.version)}
                alt={`${contribution.contributor.displayName} 投稿的最新照片`}
                sizeClassName="h-16 w-16"
                caption={contribution.suggestedCaption ?? undefined}
              />
            )}
            <blockquote className="min-w-0 flex-1 border-l-2 border-accent pl-3 font-serif text-caption text-ink">
              {contribution.memoryText}
            </blockquote>
          </div>
          <p className="text-caption text-muted">投稿者建议图注：{contribution.suggestedCaption || "（无）"}</p>
          <p className="text-caption text-muted">投稿者建议地点：{contribution.location === null ? "（无）" : `${contribution.location.name} · ${contribution.location.latitude ?? "无坐标"}${contribution.location.longitude === null ? "" : `, ${contribution.location.longitude}`}`}</p>
        </section>
      </div>
      <p className="text-micro text-muted">左侧是当前草稿，可能已被策展人修改；右侧是投稿者建议，并非历史差异。</p>
    </div>
  );
}
