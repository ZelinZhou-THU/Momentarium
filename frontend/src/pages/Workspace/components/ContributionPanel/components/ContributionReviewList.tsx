import { useState } from "react";
import { versionedContributionImageUrl } from "../../../../../apis/gallery/contributionContent";
import { ZoomablePhotoThumb } from "../../../../../components/ZoomablePhotoThumb";
import { Button } from "../../../../../components/ui";
import type { ContributionSummary } from "../../../../../objects/gallery/Contribution";
import {
  describeContributionMedia,
  describeContributionStatus,
} from "../../../../Contributions/functions/contributionGroups";
import type { AdoptedMemoryRow } from "../functions/contributionManagement";
import {
  describeReviewStatus,
  findAdoptedSnapshot,
  REMOVE_MEMORY_CONFIRM_MESSAGE,
} from "../functions/contributionManagement";
import { PendingUpdateCompare } from "./PendingUpdateCompare";

export interface ContributionReviewListProps {
  readonly reviewContributions: readonly ContributionSummary[];
  readonly declinedContributions: readonly ContributionSummary[];
  readonly withdrawnContributions: readonly ContributionSummary[];
  readonly otherContributions: readonly ContributionSummary[];
  readonly adoptedMemories: readonly AdoptedMemoryRow[];
  readonly removingMemoryId: string | null;
  readonly keptVersionIds: readonly string[];
  readonly decliningId: string | null;
  readonly onAdopt: (contribution: ContributionSummary) => void;
  readonly onDecline: (contribution: ContributionSummary) => void;
  readonly onKeepVersion: (contribution: ContributionSummary) => void;
  readonly onRemoveMemory: (photoId: string, memoryId: string) => void;
}

const ContributionMediaBadge = ({ contribution }: { readonly contribution: ContributionSummary }) => (
  <span className="rounded-md bg-bg px-2 py-1 text-micro text-muted">
    {describeContributionMedia(contribution)}
  </span>
);

const ContributionBody = ({ contribution }: { readonly contribution: ContributionSummary }) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-start gap-4">
      <blockquote className="min-w-0 flex-1 border-l-2 border-line pl-4 font-serif text-body text-ink">
        {contribution.memoryText}
      </blockquote>
      {contribution.file === null ? null : (
        <ZoomablePhotoThumb
          thumbUrl={versionedContributionImageUrl(contribution.file.thumbUrl, contribution.version)}
          fullUrl={versionedContributionImageUrl(contribution.file.contentUrl, contribution.version)}
          alt={`${contribution.contributor.displayName} 投稿的照片`}
          sizeClassName="h-24 w-24"
          caption={contribution.suggestedCaption ?? undefined}
        />
      )}
    </div>
    {contribution.suggestedCaption === null ||
    contribution.suggestedCaption.trim().length === 0 ? null : (
      <p className="text-caption text-muted">建议图注：{contribution.suggestedCaption}</p>
    )}
  </div>
);

/** 审阅列表：待审/待确认更新优先；未被采用、已撤回分区可见；已采用讲述可移除。 */
export function ContributionReviewList({
  reviewContributions,
  declinedContributions,
  withdrawnContributions,
  otherContributions,
  adoptedMemories,
  removingMemoryId,
  keptVersionIds,
  decliningId,
  onAdopt,
  onDecline,
  onKeepVersion,
  onRemoveMemory,
}: ContributionReviewListProps) {
  const [confirmingDeclineId, setConfirmingDeclineId] = useState<string | null>(null);
  const [confirmingRemoveMemoryId, setConfirmingRemoveMemoryId] = useState<string | null>(null);
  const visibleReview = reviewContributions.filter(
    (contribution) => !keptVersionIds.includes(contribution.id),
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-h2 text-ink">待审回忆</h2>
          <span className="text-caption text-muted">{visibleReview.length} 段待处理</span>
        </div>
        {visibleReview.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-5 text-caption text-muted">
            没有待处理的回忆。参与者提交或修改后，这里会优先显示待审与待确认更新。
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visibleReview.map((contribution) => {
              const pendingUpdate = contribution.adoption !== null && contribution.hasPendingUpdate;
              const adopted = contribution.adoption !== null;
              const adoptedSnapshot = findAdoptedSnapshot(contribution, adoptedMemories);
              return (
                <li
                  key={contribution.id}
                  className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-caption font-medium text-ink">
                        {contribution.contributor.displayName}
                        <span className="ml-1 text-micro text-muted">
                          @{contribution.contributor.username}
                        </span>
                      </p>
                      <ContributionMediaBadge contribution={contribution} />
                      <span className="rounded-md bg-accentSoft px-2 py-1 text-micro text-ink">
                        {describeReviewStatus(contribution)}
                      </span>
                    </div>
                    <span className="text-micro text-muted">第 {contribution.version} 版</span>
                  </div>
                  {adoptedSnapshot === null || !pendingUpdate ? (
                    <ContributionBody contribution={contribution} />
                  ) : (
                    <PendingUpdateCompare contribution={contribution} adopted={adoptedSnapshot} />
                  )}
                  <p className="text-micro text-muted">
                    {contribution.location === null
                      ? "投稿者未提供位置"
                      : contribution.location.latitude === null
                        ? `地点：${contribution.location.name}（无坐标）`
                        : `地点：${contribution.location.name} · ${contribution.location.latitude}, ${contribution.location.longitude}`}
                    {adopted ? ` · 已采用第 ${contribution.adoption!.adoptedVersion} 版` : ""}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {contribution.file === null ? (
                        <span className="text-caption text-muted">
                          历史纯文字回忆没有照片，不能采用；只能标记不采用。
                        </span>
                      ) : (
                        <Button size="sm" onClick={() => onAdopt(contribution)}>
                          {pendingUpdate ? "更新到最新版" : "采用这段回忆"}
                        </Button>
                      )}
                      {pendingUpdate ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onKeepVersion(contribution)}
                        >
                          保持当前版本
                        </Button>
                      ) : null}
                    </div>
                    {adopted ? (
                      <span className="text-micro text-muted">已采用，不能标记为不采用</span>
                    ) : confirmingDeclineId === contribution.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-caption text-muted">确认不采用？</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={decliningId === contribution.id}
                          onClick={() => {
                            setConfirmingDeclineId(null);
                            onDecline(contribution);
                          }}
                        >
                          确认不采用
                        </Button>
                        <button
                          type="button"
                          className="text-caption text-muted underline-offset-4 hover:underline"
                          onClick={() => setConfirmingDeclineId(null)}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-caption text-muted underline-offset-4 hover:text-danger hover:underline"
                        onClick={() => setConfirmingDeclineId(contribution.id)}
                      >
                        不采用
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 未被采用 / 已撤回 / 其他回忆：没有内容时整块隐藏，避免空占位挤占审阅版面。 */}
      {declinedContributions.length === 0 ? null : (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-h2 text-ink">未被采用</h2>
          <ul className="flex flex-col gap-2">
            {declinedContributions.map((contribution) => (
              <li
                key={contribution.id}
                className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-caption text-ink">
                    {contribution.contributor.displayName}
                    <span className="ml-2 text-micro text-muted">未被采用</span>
                  </span>
                  <ContributionMediaBadge contribution={contribution} />
                </div>
                <ContributionBody contribution={contribution} />
                <p className="text-micro text-muted">等投稿者修改后重新提交。</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {withdrawnContributions.length === 0 ? null : (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-h2 text-ink">已撤回</h2>
          <ul className="flex flex-col gap-2">
            {withdrawnContributions.map((contribution) => (
              <li
                key={contribution.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-bg px-4 py-2"
              >
                <span className="text-caption text-ink">
                  {contribution.contributor.displayName}
                  <span className="ml-2 text-micro text-muted">{describeContributionStatus(contribution)}</span>
                </span>
                <span className="text-micro text-muted">第 {contribution.version} 版</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-h2 text-ink">已采用的讲述</h2>
        <p className="text-micro text-muted">
          移除讲述会二次确认：若这张照片由该投稿新建且没有其他讲述，会一并从草稿移除或归档；已发布版本不会改变。
        </p>
        {adoptedMemories.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-5 text-caption text-muted">
            还没有已采用的讲述。采用回忆后，讲述会出现在照片大图与草稿详情里。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {adoptedMemories.map((memory) => (
              <li
                key={memory.memoryId}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <ZoomablePhotoThumb
                    thumbUrl={memory.thumbUrl}
                    fullUrl={memory.contentUrl}
                    alt={memory.photoLabel}
                    sizeClassName="h-16 w-16"
                    caption={memory.photoLabel}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-caption text-muted">{memory.photoLabel}</p>
                    <p className="mt-1 text-body text-ink">{memory.text}</p>
                    <p className="mt-1 text-micro text-muted">— {memory.contributorName}</p>
                  </div>
                </div>
                {confirmingRemoveMemoryId === memory.memoryId ? (
                  <div className="flex max-w-md flex-col items-end gap-2">
                    <p className="text-right text-micro text-muted">{REMOVE_MEMORY_CONFIRM_MESSAGE}</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={removingMemoryId === memory.memoryId}
                        onClick={() => {
                          setConfirmingRemoveMemoryId(null);
                          onRemoveMemory(memory.photoId, memory.memoryId);
                        }}
                      >
                        确认移除
                      </Button>
                      <button
                        type="button"
                        className="text-caption text-muted underline-offset-4 hover:underline"
                        onClick={() => setConfirmingRemoveMemoryId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={removingMemoryId === memory.memoryId}
                    onClick={() => setConfirmingRemoveMemoryId(memory.memoryId)}
                  >
                    移除讲述
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {otherContributions.length === 0 ? null : (
        <section className="flex flex-col gap-2">
          <h2 className="font-serif text-h2 text-ink">其他回忆</h2>
          <ul className="flex flex-col gap-2">
            {otherContributions.map((contribution) => (
              <li
                key={contribution.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-bg px-4 py-2"
              >
                <span className="text-caption text-ink">
                  {contribution.contributor.displayName}
                  <span className="ml-2 text-micro text-muted">
                    {describeReviewStatus(contribution)}
                  </span>
                </span>
                <span className="text-micro text-muted">第 {contribution.version} 版</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
