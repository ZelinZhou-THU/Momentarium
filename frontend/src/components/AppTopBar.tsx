import type { ReactNode } from "react";
import { MainNav } from "./MainNav";
import { SessionControls } from "./SessionControls";
import { TopBar } from "./ui";

export interface AppTopBarProps {
  /** 页面自己的上下文操作（如「← 返回工作台」），显示在用户菜单左侧。 */
  readonly children?: ReactNode;
}

/** 登录后所有页面共用的顶栏：品牌 + 主导航（我的展览 / 我参与的）+ 页面操作 + 用户菜单。 */
export function AppTopBar({ children }: AppTopBarProps) {
  return (
    <TopBar nav={<MainNav />}>
      {children}
      <SessionControls />
    </TopBar>
  );
}
