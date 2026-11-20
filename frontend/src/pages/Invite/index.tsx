import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GetContributionInviteAPI } from "../../apis/gallery/GetContributionInviteAPI";
import { JoinContributionAPI } from "../../apis/gallery/JoinContributionAPI";
import { describeContributionError } from "../../apis/gallery/describeContributionError";
import { ApiError } from "../../apis/shared/ApiError";
import { ErrorState, Spinner } from "../../components/ui";
import { useSessionToken } from "../../stores/sessionStore";
import { InviteCard } from "./components/InviteCard";
import type { InviteJoinState, InviteLoadState } from "./objects/InviteState";

/**
 * 公开邀请页（/invite/:token）：只读取展览标题与邀请状态。
 * 未登录先登录/注册并带 next 回到本页；有效→加入；已关闭→不可加入；加入成功→进入我的投稿。
 */
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const inviteToken = token ?? "";
  const signedIn = useSessionToken() !== null;
  const [loadState, setLoadState] = useState<InviteLoadState>({ status: "loading" });
  const [joinState, setJoinState] = useState<InviteJoinState>({ status: "idle" });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (inviteToken.length === 0) {
      setLoadState({ status: "notfound" });
      return;
    }
    const controller = new AbortController();
    setLoadState({ status: "loading" });
    new GetContributionInviteAPI(inviteToken).send({ signal: controller.signal }).then(
      (preview) => {
        if (!controller.signal.aborted) {
          setLoadState({ status: "ready", preview });
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setLoadState(
          error instanceof ApiError && error.code === "NOT_FOUND"
            ? { status: "notfound" }
            : { status: "error", message: describeContributionError(error) },
        );
      },
    );
    return () => controller.abort();
  }, [inviteToken, reloadCount]);

  const join = (): void => {
    setJoinState({ status: "joining" });
    new JoinContributionAPI(inviteToken).send().then(
      (membership) => {
        if (membership.status === "revoked") {
          setJoinState({
            status: "error",
            message: "参与关系已被创建者撤销，无法重新加入",
          });
          return;
        }
        setJoinState({ status: "joined", membership });
      },
      (error: unknown) => setJoinState({ status: "error", message: describeContributionError(error) }),
    );
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-8 py-16">
      {loadState.status === "loading" ? (
        <Spinner label="正在打开邀请" />
      ) : loadState.status === "notfound" ? (
        <div className="w-full max-w-lg text-center">
          <h1 className="font-serif text-h1 text-ink">邀请链接无效或已失效</h1>
          <p className="mt-3 text-body text-muted">
            请向展览作者确认是否仍有有效的邀请链接；单个展览的分享链接仍然可以直接打开。
          </p>
          <Link
            viewTransition
            to="/"
            className="mt-6 inline-block text-caption text-accent underline-offset-4 hover:underline"
          >
            回到首页
          </Link>
        </div>
      ) : loadState.status === "error" ? (
        <div className="w-full max-w-lg">
          <ErrorState
            message={loadState.message}
            onRetry={() => setReloadCount((count) => count + 1)}
          />
        </div>
      ) : (
        <InviteCard
          token={inviteToken}
          preview={loadState.preview}
          signedIn={signedIn}
          joinState={joinState}
          onJoin={join}
        />
      )}
    </main>
  );
}
