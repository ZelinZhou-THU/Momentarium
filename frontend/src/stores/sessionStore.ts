import { create } from "zustand";
import { clearStoredToken, readStoredToken, storeToken } from "../apis/shared/tokenStorage";
import type { UserView } from "../objects/UserView";

/** 跨页面共享的核心数据只有会话：令牌 + 当前用户（spec 11.3）。 */
interface SessionState {
  readonly token: string | null;
  readonly user: UserView | null;
}

// store 私有：外部只能通过本文件公开的语义化 use/set/get 函数访问，避免任意读写与命名漂移。
const sessionStore = create<SessionState>(() => ({
  token: readStoredToken(),
  user: null,
}));

export const useSessionToken = (): string | null => sessionStore((state) => state.token);

export const useSessionUser = (): UserView | null => sessionStore((state) => state.user);

/** 登录 / 注册成功后写入令牌与用户；令牌同时落到 localStorage。 */
export const setSession = (token: string, user: UserView): void => {
  storeToken(token);
  sessionStore.setState({ token, user });
};

/** 已有令牌时只补齐用户（App 启动恢复会话用）。 */
export const setSessionUser = (user: UserView): void => {
  sessionStore.setState({ user });
};

/** 登出或令牌失效时清空。 */
export const clearSession = (): void => {
  clearStoredToken();
  sessionStore.setState({ token: null, user: null });
};

/** 供组件外的发送逻辑读取令牌；组件内请用 useSessionToken 以跟随状态更新。 */
export const getSessionToken = (): string | null => sessionStore.getState().token;
