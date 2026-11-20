import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, Outlet, Route, createRoutesFromElements, useLocation } from "react-router-dom";
import { ApiError } from "./apis/shared/ApiError";
import { GetCurrentUserAPI } from "./apis/users/GetCurrentUserAPI";
import { ErrorState, Spinner } from "./components/ui";
import {
  currentPathWithSearch,
  loginPathAfterSessionLoss,
} from "./pages/Auth/functions/authRedirect";
import LoginPage from "./pages/Auth/Login";
import RegisterPage from "./pages/Auth/Register";
import AccountPage from "./pages/Account";
import AuthorHomePage from "./pages/AuthorHome";
import ContributionsPage from "./pages/Contributions";
import ExhibitionsPage from "./pages/Exhibitions";
import HomePage from "./pages/Home";
import InvitePage from "./pages/Invite";
import PhotoInsightsPage from "./pages/PhotoInsights";
import PublicShowPage, { DraftPreviewShowPage } from "./pages/PublicShow";
import SceneVersionsPage from "./pages/SceneVersions";
import WorkspacePage from "./pages/Workspace";
import { useRouteExhibitionTheme } from "./theme/useRouteExhibitionTheme";
import {
  clearSession,
  setSessionUser,
  useSessionToken,
  useSessionUser,
} from "./stores/sessionStore";

/**
 * 受保护路由骨架：无令牌直接跳 /login；有令牌但用户未恢复时调 getcurrentuser 补全，
 * 401 清空会话回登录页，其它失败给出可重试的错误态（spec 11.1 / 11.3）。
 */
function RequireSession() {
  const token = useSessionToken();
  const user = useSessionUser();
  const location = useLocation();
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [restoreFailed, setRestoreFailed] = useState(false);
  // 本次访问期间是否登录成功过：登出后不要带 next 回跳（见 loginPathAfterSessionLoss）。
  const hadSessionRef = useRef(false);

  useEffect(() => {
    if (user !== null) {
      hadSessionRef.current = true;
    }
  }, [user]);

  useEffect(() => {
    if (token === null || user !== null) {
      return;
    }
    setRestoreFailed(false);
    new GetCurrentUserAPI()
      .send()
      .then((currentUser) => setSessionUser(currentUser))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
          clearSession();
          return;
        }
        setRestoreFailed(true);
      });
  }, [token, user, restoreAttempt]);

  if (token === null) {
    // 直接访问受保护页面时登录后回到该页（邀请页/我参与的等）；登出则回干净的登录页。
    return (
      <Navigate
        to={loginPathAfterSessionLoss(
          hadSessionRef.current,
          currentPathWithSearch(location.pathname, location.search),
        )}
        replace
      />
    );
  }

  if (restoreFailed) {
    return (
      <SessionFallback>
        <ErrorState
          title="无法恢复会话"
          message="连接服务器失败，请稍后重试。"
          onRetry={() => setRestoreAttempt((attempt) => attempt + 1)}
        />
      </SessionFallback>
    );
  }

  if (user === null) {
    return (
      <SessionFallback>
        <Spinner label="正在恢复会话" />
      </SessionFallback>
    );
  }

  return <Outlet />;
}

function SessionFallback({ children }: { readonly children: ReactNode }) {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-bg px-8">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

/** 所有页面共用的外壳：按当前路由给整站上色（展览相关页面跟随场景配色）。 */
function AppShell() {
  useRouteExhibitionTheme();
  return <Outlet />;
}

/**
 * 全部路由。直接注册为数据路由（而非在通配路由里再套一层 <Routes>）：
 * 工作台的未保存修改保护依赖 useBlocker，页面切换动画依赖 Link / navigate 的 viewTransition，
 * 这两者都只对数据路由生效。
 */
export const appRoutes = createRoutesFromElements(
  <Route element={<AppShell />}>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />

    <Route element={<RequireSession />}>
      <Route path="/" element={<HomePage />} />
      <Route path="/exhibitions" element={<ExhibitionsPage />} />
      <Route path="/contributions" element={<ContributionsPage />} />
      <Route path="/exhibitions/:id" element={<WorkspacePage />} />
      <Route path="/exhibitions/:id/view" element={<DraftPreviewShowPage />} />
      <Route path="/exhibitions/:id/scenes" element={<SceneVersionsPage />} />
      <Route path="/exhibitions/:id/insights" element={<PhotoInsightsPage />} />
      <Route path="/account" element={<AccountPage />} />
    </Route>

    <Route path="/invite/:token" element={<InvitePage />} />
    <Route path="/show/:id" element={<PublicShowPage />} />
    <Route path="/u/:username" element={<AuthorHomePage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>,
);
