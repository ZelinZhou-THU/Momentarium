import { useState } from "react";
import { versionedContributionImageUrl } from "../../../apis/gallery/contributionContent";
import { WithdrawContributionAPI } from "../../../apis/gallery/WithdrawContributionAPI";
import { describeContributionError } from "../../../apis/gallery/describeContributionError";
import { AuthorizedPhotoThumb } from "../../../components/AuthorizedPhotoThumb";
import { Button } from "../../../components/ui";
import type { ContributionSummary } from "../../../objects/gallery/Contribution";
import {
  describeAdoptionDestination,
  describeContributionMedia,
  describeContributionStatus,
  formatContributionTime,
  isHistoricalTextOnly,
  publicExhibitionPathOf,
  WITHDRAW_CONTRIBUTION_CONFIRM_MESSAGE,
} from "../functions/contributionGroups";

export interface ContributionCardProps {
  readonly contribution: ContributionSummary;
  readonly onEdit: (contribution: ContributionSummary) => void;
  readonly onWithdrawn: () => void;
}

/**
 * 我参与的页的回忆卡片：回忆文字优先，纯文字没有缩略图、用引用块与「纯文字回忆」标识；
 * 有照片时显示照片；已采用显示目标与版本；未被采用可修改后重新提交；撤回就地二次确认。
 */
export function ContributionCard({ contribution, onEdit, onWithdrawn }: ContributionCardProps) {
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = contribution.status !== "withdrawn";
  const textOnly = contribution.file === null;
  const publicPath = publicExhibitionPathOf(contribution);
  const hasBody = contribution.memoryText.trim().length > 0;

  const withdraw = (): void => {
    setWithdrawing(true);
    setError(null);
    new WithdrawContributionAPI(contribution.id).send().then(
      () => onWithdrawn(),
      (withdrawError: unknown) => {
        setWithdrawing(false);
        setConfirmingWithdraw(false);
        setError(describeContributionError(withdrawError));
      },
    );
  };

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-caption font-medium text-ink">
            {describeContributionStatus(contribution)}
          </p>
          <span className="rounded-md bg-bg px-2 py-1 text-micro text-muted">
            {describeContributionMedia(contribution)}
          </span>
        </div>
        <time className="text-micro text-muted">
          {formatContributionTime(contribution.updatedAt)} · 第 {contribution.version} 版
        </time>
      </div>

      <div className="flex items-start gap-4">
        <blockquote
          className={`min-w-0 flex-1 border-l-2 border-line pl-4 font-serif text-body ${
            hasBody ? "text-ink" : "text-muted"
          }`}
        >
          {hasBody ? contribution.memoryText : "（草稿还没有写下回忆）"}
        </blockquote>
        {textOnly ? null : (
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-line bg-accentSoft">
            <AuthorizedPhotoThumb
              url={versionedContributionImageUrl(contribution.file!.thumbUrl, contribution.version)}
              alt="这条回忆的照片"
            />
          </div>
        )}
      </div>

      {isHistoricalTextOnly(contribution) ? (
        <p className="text-micro text-muted">
          这条历史纯文字回忆没有照片；补一张照片后才能重新提交（已发布内容不受影响）。
        </p>
      ) : null}

      {contribution.suggestedCaption === null || contribution.suggestedCaption.trim().length === 0 ? null : (
        <p className="text-caption text-muted">建议图注：{contribution.suggestedCaption}</p>
      )}

      {contribution.location === null ? null : (
        <p className="text-micro text-muted">
          地点：{contribution.location.name}
          {contribution.location.latitude === null
            ? ""
            : ` · ${contribution.location.latitude}, ${contribution.location.longitude}`}
        </p>
      )}

      {contribution.adoption === null ? null : (
        <p className="text-caption text-accent">
          策展人已把这段回忆采用到一张照片（第 {contribution.adoption.adoptedVersion} 版）。{" "}
          {describeAdoptionDestination(contribution)}
        </p>
      )}
      {publicPath === null ? null : (
        <a
          href={publicPath}
          target="_blank"
          rel="noreferrer"
          className="w-fit text-caption text-accent underline-offset-4 hover:underline"
        >
          查看公开展览《{contribution.exhibitionTitle}》 →
        </a>
      )}
      {contribution.status === "declined" ? (
        <p className="text-caption text-muted">
          策展人这次没有采用这段回忆。你可以修改文字、补一张照片或地点后重新提交。
        </p>
      ) : null}
      {contribution.status === "withdrawn" && contribution.withdrawnAt !== null ? (
        <p className="text-micro text-muted">
          撤回于 {formatContributionTime(contribution.withdrawnAt)}
        </p>
      ) : null}

      {error === null ? null : <p className="text-caption text-danger">{error}</p>}

      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="secondary" onClick={() => onEdit(contribution)}>
            {contribution.status === "declined" ? "修改并重新提交" : "修改内容"}
          </Button>
          {confirmingWithdraw ? (
            <div className="flex max-w-md flex-col items-end gap-2">
              <p className="text-right text-caption text-muted">
                {WITHDRAW_CONTRIBUTION_CONFIRM_MESSAGE}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-caption text-muted">确认撤回？</span>
                <Button size="sm" variant="secondary" loading={withdrawing} onClick={withdraw}>
                  确认撤回
                </Button>
                <button
                  type="button"
                  className="text-caption text-muted underline-offset-4 hover:underline"
                  onClick={() => setConfirmingWithdraw(false)}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="text-caption text-muted underline-offset-4 hover:text-danger hover:underline"
              onClick={() => setConfirmingWithdraw(true)}
            >
              撤回这段回忆
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}
