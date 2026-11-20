import { useState } from "react";
import { Button } from "../../../../../components/ui";
import type { ContributionInviteCreated, ContributionInviteSummary } from "../../../../../objects/gallery/ContributionInvite";
import type { ContributorView } from "../../../../../objects/gallery/ContributionManagement";
import {
  describeInviteStatusLabel,
  describeParticipantStatusLabel,
  inviteUrl,
} from "../functions/contributionManagement";

export interface InviteLinksSectionProps {
  readonly invites: readonly ContributionInviteSummary[];
  readonly participants: readonly ContributorView[];
  readonly createdInvite: ContributionInviteCreated | null;
  readonly creating: boolean;
  readonly closingInviteId: string | null;
  readonly revokingContributorId: string | null;
  readonly onCreate: () => void;
  readonly onClose: (inviteId: string) => void;
  readonly onRevoke: (contributorId: string) => void;
}

/**
 * 工作台「投稿」分区的邀请与参与者管理：
 * 创建邀请链接（token 只出现一次，立即复制）、关闭单条链接、撤销参与者；
 * 关闭/撤销都不影响已采用的讲述与投稿。
 */
export function InviteLinksSection({
  invites,
  participants,
  createdInvite,
  creating,
  closingInviteId,
  revokingContributorId,
  onCreate,
  onClose,
  onRevoke,
}: InviteLinksSectionProps) {
  const [copied, setCopied] = useState(false);

  const copy = (url: string): void => {
    void navigator.clipboard?.writeText(url).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-h2 text-ink">邀请与参与者</h2>
        <Button size="sm" loading={creating} onClick={onCreate}>
          创建邀请链接
        </Button>
      </div>
      <p className="text-caption text-muted">
        邀请链接只用于加入展览；参与者上传的照片与讲述需要你逐条审阅、采用后才会进入草稿。
      </p>

      {createdInvite === null ? null : (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-bg p-4">
          <p className="text-caption font-medium text-ink">新的邀请链接（只显示这一次）</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={inviteUrl(createdInvite.token)}
              aria-label="新邀请链接"
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-caption text-ink"
              onFocus={(event) => event.target.select()}
            />
            <Button size="sm" variant="secondary" onClick={() => copy(inviteUrl(createdInvite.token))}>
              复制
            </Button>
          </div>
          <p className="text-micro text-muted">
            关闭页面后无法再次查看明文 token；如需新链接请重新创建。{copied ? " 已复制。" : ""}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-caption font-medium text-ink">邀请链接</h3>
          {invites.length === 0 ? (
            <p className="text-caption text-muted">还没有邀请链接。</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-bg px-3 py-2"
                >
                  <span className="text-caption text-ink">
                    {describeInviteStatusLabel(invite.status)}
                    <span className="ml-2 text-micro text-muted">
                      创建 {invite.createdAt.slice(0, 10)}
                      {invite.closedAt === null ? "" : ` · 关闭 ${invite.closedAt.slice(0, 10)}`}
                    </span>
                  </span>
                  {invite.status === "active" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={closingInviteId === invite.id}
                      onClick={() => onClose(invite.id)}
                    >
                      关闭
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-caption font-medium text-ink">参与者</h3>
          {participants.length === 0 ? (
            <p className="text-caption text-muted">还没有人通过邀请链接加入。</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {participants.map((participant) => (
                <li
                  key={participant.contributorId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-bg px-3 py-2"
                >
                  <span className="text-caption text-ink">
                    {participant.displayName}
                    <span className="ml-1 text-micro text-muted">@{participant.username}</span>
                    <span className="ml-2 text-micro text-muted">
                      {describeParticipantStatusLabel(participant.status)} · {participant.contributionCount} 条投稿
                    </span>
                  </span>
                  {participant.status === "active" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={revokingContributorId === participant.contributorId}
                      onClick={() => onRevoke(participant.contributorId)}
                    >
                      撤销参与
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
