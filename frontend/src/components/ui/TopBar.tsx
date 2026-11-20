import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TOP_BAR_TRANSITION_NAME } from "../../motion/transitionNames";

export interface TopBarProps {
  // 品牌右侧的主导航（全站并列的空间入口）；不传则只有品牌。
  nav?: ReactNode;
  // 右侧区域：页面级操作、当前用户菜单等（深色底，子元素用 surface 反色文字）。
  children?: ReactNode;
}

/** 全站顶栏：深色 night 底，与工作台页头、公开展厅连成一条视觉主线；品牌固定回「我的展览」（无仪表盘，它就是登录后的主页），不按角色分流。 */
export function TopBar({ nav, children }: TopBarProps) {
  return (
    <header style={{ viewTransitionName: TOP_BAR_TRANSITION_NAME }} className="bg-night">
      <div className="mx-auto flex min-h-16 w-full max-w-content flex-wrap items-center justify-between gap-x-4 gap-y-2 px-8 py-2">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <Link viewTransition to="/exhibitions" className="flex items-baseline gap-3">
            <span className="font-serif text-h2 text-surface">Momentarium</span>
            <span className="hidden text-micro text-surface/60 sm:inline">私人记忆档案馆</span>
          </Link>
          {nav === undefined ? null : (
            <div className="sm:border-l sm:border-surface/20 sm:pl-8">{nav}</div>
          )}
        </div>
        {children ? <div className="flex items-center gap-3">{children}</div> : null}
      </div>
    </header>
  );
}
