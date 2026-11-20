export interface MainNavItem {
  readonly to: string;
  readonly label: string;
}

/**
 * 登录后全站并列的两个空间：我策展的展览、我受邀参与的展览。
 * 作者主页是公开身份而非工作空间，收在用户菜单里，不在这里。
 */
export const MAIN_NAV_ITEMS: readonly MainNavItem[] = [
  { to: "/exhibitions", label: "我的展览" },
  { to: "/contributions", label: "我参与的" },
];
