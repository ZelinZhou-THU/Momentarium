import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  WORKSPACE_TABS,
  WORKSPACE_TAB_PARAM,
  WORKSPACE_VIEW_PARAM,
  isImmersiveSceneView,
  parseWorkspaceTab,
  withWorkspaceLocation,
} from "../functions/workspaceTabs";
import type { WorkspaceTabId } from "../functions/workspaceTabs";

export interface WorkspaceTabsModel {
  readonly activeTab: WorkspaceTabId;
  readonly isImmersive: boolean;
  readonly searchParams: URLSearchParams;
  changeTab(tabId: string): void;
  changeImmersive(immersive: boolean): void;
}

/**
 * 工作台分区与沉浸观看的网址状态：
 * - 当前分区记在 `?tab=`，没有时落到初始分区并写回网址；
 * - 沉浸观看记在 `?view=immersive`，用历史压栈进入时退出回退一步；
 * - 页面本身只消费 activeTab/isImmersive，不再自己拼网址参数。
 */
export const useWorkspaceTabs = (initialTab: WorkspaceTabId): WorkspaceTabsModel => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [fallbackTab] = useState<WorkspaceTabId>(initialTab);
  const tabFromUrl = parseWorkspaceTab(searchParams.get(WORKSPACE_TAB_PARAM));
  const activeTab = tabFromUrl ?? fallbackTab;
  const pushedImmersiveRef = useRef(false);
  const navigate = useNavigate();

  const writeTabToUrl = (tabId: WorkspaceTabId, animated: boolean): void => {
    pushedImmersiveRef.current = false;
    setSearchParams((current) => withWorkspaceLocation(current, tabId, false), {
      replace: true,
      viewTransition: animated,
    });
  };

  useEffect(() => {
    if (tabFromUrl === null) {
      writeTabToUrl(fallbackTab, false);
    }
  }, [tabFromUrl]);

  const changeTab = (tabId: string): void => {
    const nextTab = WORKSPACE_TABS.find((tab) => tab.id === tabId)?.id;
    if (nextTab === undefined) {
      return;
    }
    writeTabToUrl(nextTab, true);
  };

  const changeImmersive = (immersive: boolean): void => {
    if (immersive) {
      pushedImmersiveRef.current = true;
      setSearchParams((current) => withWorkspaceLocation(current, "scene", true));
      return;
    }
    if (pushedImmersiveRef.current) {
      pushedImmersiveRef.current = false;
      navigate(-1);
      return;
    }
    writeTabToUrl("scene", true);
  };

  return {
    activeTab,
    isImmersive: isImmersiveSceneView(activeTab, searchParams.get(WORKSPACE_VIEW_PARAM)),
    searchParams,
    changeTab,
    changeImmersive,
  };
};
