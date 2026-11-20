import { Link } from "react-router-dom";
import { Button } from "../../../components/ui";
import type { ContributionInvitePreview } from "../../../objects/gallery/ContributionInvite";
import { CONTRIBUTION_AI_USE_NOTICE } from "../../../objects/gallery/contributionNotices";
import { loginPathWithNext, registerPathWithNext } from "../../Auth/functions/authRedirect";
import {
  canJoinInvite,
  contributionsPathForMembership,
  describeInviteStatus,
  inviteReturnPath,
} from "../functions/inviteCopy";
import type { InviteJoinState } from "../objects/InviteState";

export interface InviteCardProps {
  readonly token: string;
  readonly preview: ContributionInvitePreview;
  readonly signedIn: boolean;
  readonly joinState: InviteJoinState;
  readonly onJoin: () => void;
}

/**
 * 公开邀请页卡片：只显示展览标题、邀请人展示名与邀请状态（无私有照片/讲述/位置/成员），并告知采用后的回忆会用于 AI 策展。
 * - 未登录且链接有效：先去登录/注册，成功后回到本邀请页；
 * - 登录且有效：加入（重复点击幂等）；已加入显示「进入我参与的」；
 * - 已关闭：不可加入，不引导登录。
 */
export function InviteCard({ token, preview, signedIn, joinState, onJoin }: InviteCardProps) {
  const joinable = canJoinInvite(preview);
  const returnPath = inviteReturnPath(token);

  return (
    <section className="w-full max-w-lg rounded-xl border border-line bg-surface p-8">
      <p className="text-caption text-muted">Momentarium · 共同投稿邀请</p>
      <h1 className="mt-3 font-serif text-h1 text-ink">{preview.exhibitionTitle}</h1>
      <p className="mt-2 text-body text-ink">{preview.inviterName} 邀请你为这场展览写下一段回忆</p>
      <p className="mt-3 text-body text-muted">{describeInviteStatus(preview)}</p>

      {!joinable ? null : joinState.status === "joined" || !signedIn ? (
        <div className="mt-8 flex flex-col gap-3">
          {joinState.status === "joined" ? (
            <Link
              viewTransition
              to={contributionsPathForMembership(
                joinState.membership.exhibitionId,
                joinState.membership.exhibitionTitle,
              )}
              className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 text-body font-medium text-surface transition duration-150 ease-out hover:opacity-90 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              进入我参与的 →
            </Link>
          ) : (
            <>
              <Link
                viewTransition
                to={loginPathWithNext(returnPath)}
                className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 text-body font-medium text-surface transition duration-150 ease-out hover:opacity-90 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                登录后加入
              </Link>
              <p className="text-caption text-muted">
                还没有账号？
                <Link
                  viewTransition
                  to={registerPathWithNext(returnPath)}
                  className="ml-1 text-accent underline underline-offset-4 hover:text-ink"
                >
                  注册一个再加入
                </Link>
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          <Button loading={joinState.status === "joining"} onClick={onJoin}>
            加入这场展览
          </Button>
          <p className="text-caption text-muted">
            加入后写下一段回忆，并附一张照片；也可以先保存草稿，稍后再补图。
          </p>
        </div>
      )}

      {joinState.status === "error" ? (
        <p className="mt-4 text-caption text-danger">{joinState.message}</p>
      ) : null}
      <p className="mt-6 text-micro text-muted">
        邀请链接只用于加入展览，不会公开或授权任何私有照片、讲述与位置。
      </p>
      <p className="mt-2 text-micro text-muted">{CONTRIBUTION_AI_USE_NOTICE}</p>
    </section>
  );
}
