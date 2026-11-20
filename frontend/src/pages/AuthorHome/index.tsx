import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { GetCurrentUserAPI } from "../../apis/users/GetCurrentUserAPI";
import { ApiError } from "../../apis/shared/ApiError";
import { ErrorState, Reveal, Spinner } from "../../components/ui";
import {
  clearSession,
  setSessionUser,
  useSessionToken,
  useSessionUser,
} from "../../stores/sessionStore";
import { AuthorExhibitionGrid } from "./components/AuthorExhibitionGrid";
import { AuthorHomeNav } from "./components/AuthorHomeNav";
import { AuthorHomeUnavailable } from "./components/AuthorHomeUnavailable";
import { JourneyMapSection } from "./components/JourneyMapSection";
import { describeAuthorHome } from "./functions/describeAuthorHome";
import { useAuthorPage } from "./hooks/useAuthorPage";

/** 作者主页（公开）：作者资料 + 全部已发布展览；作者未开启或不存在时给出同一提示。 */
export default function AuthorHomePage() {
  const { username } = useParams<{ username: string }>();
  return username === undefined ? <Navigate to="/" replace /> : <AuthorHomeContent username={username} />;
}

function AuthorHomeContent({ username }: { readonly username: string }) {
  const { state, reload } = useAuthorPage(username);
  const token = useSessionToken();
  const currentUser = useSessionUser();

  // 公开路由不在 RequireSession 下：带着已存令牌直接打开作者主页时补一次会话用户，
  // 让顶部导航与「本人未公开主页」的账户设置入口按登录状态正确显示（不阻塞页面渲染）。
  useEffect(() => {
    if (token === null || currentUser !== null) {
      return;
    }
    new GetCurrentUserAPI().send().then(setSessionUser, (error: unknown) => {
      if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
        clearSession();
      }
    });
  }, [token, currentUser]);

  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto w-full max-w-content px-8 py-16">
        {/* 轻量导航放在资料页头之前，任何状态（加载/未公开/错误/就绪）都能离开本页。 */}
        <AuthorHomeNav signedIn={currentUser !== null} />
        {state.status === "loading" ? (
          <div className="flex justify-center py-24">
            <Spinner label="正在打开作者主页" />
          </div>
        ) : state.status === "notFound" ? (
          <AuthorHomeUnavailable
            username={username}
            currentUsername={currentUser?.username ?? null}
          />
        ) : state.status === "error" ? (
          <ErrorState message={state.message} onRetry={reload} />
        ) : (
          <AuthorHomeReady page={state.page} />
        )}
      </main>
    </div>
  );
}

function AuthorHomeReady({ page }: { readonly page: Parameters<typeof describeAuthorHome>[0] }) {
  const heading = describeAuthorHome(page);
  return (
    <>
      <Reveal>
        <header className="border-b border-line pb-8">
          <p className="text-caption text-muted">Momentarium · 作者主页</p>
          <h1 className="mt-2 font-serif text-display text-ink">{heading.displayName}</h1>
          {heading.handle === null ? null : <p className="mt-1 text-caption text-muted">{heading.handle}</p>}
          {page.bio === "" ? null : <p className="mt-4 max-w-2xl text-body text-ink">{page.bio}</p>}
          <p className="mt-4 text-caption text-muted">{heading.countLabel}</p>
        </header>
      </Reveal>
      {page.exhibitions.length === 0 ? null : (
        <div className="mt-12">
          <AuthorExhibitionGrid exhibitions={page.exhibitions} />
        </div>
      )}
      {/* 资料/展览卡片之后：作者跨展览公开地点的只读聚类地图（没有公开位置时整块不显示）。 */}
      <JourneyMapSection page={page} />
    </>
  );
}
