/**
 * 登录/注册后的回跳：只接受站内绝对路径（以单个 `/` 开头），
 * 其他值（外链、`//host`、空）一律回到站点首页（按角色再分流到「我的展览」或「我参与的」），避免开放重定向。
 */
export const DEFAULT_AUTH_REDIRECT = "/";

export const safeAuthRedirect = (value: string | null): string => {
  if (value === null) {
    return DEFAULT_AUTH_REDIRECT;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT;
  }
  return trimmed;
};

/** 登录页地址；next 为登录成功后的站内回跳路径（如邀请页）。 */
export const loginPathWithNext = (next: string): string =>
  `/login?next=${encodeURIComponent(next)}`;

/** 注册页地址；next 为注册成功后的站内回跳路径。 */
export const registerPathWithNext = (next: string): string =>
  `/register?next=${encodeURIComponent(next)}`;

/**
 * 受保护页面失去会话时的登录页地址：
 * - 本次访问期间已经登录过（主动登出 / 会话被清）→ 回干净的登录页，
 *   否则换另一个账号登录会被送回上一个用户的页面；
 * - 从未登录过（直接打开受保护链接）→ 带 next，登录后回到目标页。
 */
export const loginPathAfterSessionLoss = (hadSession: boolean, currentPath: string): string =>
  hadSession ? "/login" : loginPathWithNext(currentPath);

/** 当前受保护页面的回跳路径（路由 pathname + search，供 RequireSession 跳登录用）。 */
export const currentPathWithSearch = (pathname: string, search: string): string =>
  search.length === 0 ? pathname : `${pathname}${search}`;
