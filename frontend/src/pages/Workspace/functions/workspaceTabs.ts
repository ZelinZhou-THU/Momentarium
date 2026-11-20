import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";

/** 工作台分区：照片 / 策展（含 AI 灵感面板）/ 投稿 / 地图（可选步骤）/ 三维场景 / 发布（全部分区常驻挂载，只切换可见性）。 */
export type WorkspaceTabId = "photos" | "curation" | "contributions" | "map" | "scene" | "publish";

export interface WorkspaceTabDefinition {
  readonly id: WorkspaceTabId;
  readonly label: string;
}

export const WORKSPACE_TABS: readonly WorkspaceTabDefinition[] = [
  { id: "photos", label: "照片" },
  { id: "curation", label: "策展" },
  { id: "contributions", label: "投稿" },
  { id: "map", label: "地图" },
  { id: "scene", label: "三维场景" },
  { id: "publish", label: "发布" },
];

/** 网址 `?tab=` 参数名：刷新 / 分享 / 返回时保留所在分区。 */
/** 打开工作台且网址没有 ?tab= 时的默认分区。 */
export const DEFAULT_WORKSPACE_TAB: WorkspaceTabId = "photos";

export const WORKSPACE_TAB_PARAM = "tab";

/** 把网址参数收窄为合法分区；缺失或非法返回 null（由调用方回退到"下一步"所在分区）。 */
export const parseWorkspaceTab = (value: string | null): WorkspaceTabId | null =>
  WORKSPACE_TABS.find((tab) => tab.id === value)?.id ?? null;

export const findWorkspaceTabLabel = (tabId: WorkspaceTabId): string =>
  WORKSPACE_TABS.find((tab) => tab.id === tabId)?.label ?? tabId;

export interface TabBadge {
  readonly label: string;
  readonly dot: boolean;
}

/** 三维场景 tab 徽标：以后端 detail.sceneRun 的运行状态为准（轮询期间可能短暂滞后，静默刷新会更新）。 */
export const describeSceneTabBadge = (detail: ExhibitionDetail): TabBadge => {
  const run = detail.sceneRun;
  if (run === null) {
    return { label: "未生成", dot: false };
  }
  switch (run.status) {
    case "queued":
    case "generating":
      return { label: "生成中", dot: false };
    case "awaiting_capture":
      // 截图需要场景分区可见：用圆点提醒用户回到「三维场景」。
      return { label: "待截图", dot: true };
    case "reviewing":
      return { label: "评审中", dot: false };
    case "cancelled":
      return { label: "已取消", dot: false };
    case "failed":
      return { label: "失败", dot: true };
    case "succeeded": {
      // 素材或策展在场景生成之后变过（如采用了投稿）：先提示过期，发布前必须重新生成。
      if (detail.sceneStale) {
        return { label: "已过期", dot: true };
      }
      const hasResultToHandle = detail.publication === null || detail.hasUnpublishedChanges;
      return {
        label: run.source === "fallback" ? "兜底" : "已通过",
        dot: hasResultToHandle,
      };
    }
  }
};

/** 投稿 tab 徽标：有待处理回忆时显示数量并带圆点；没有时不显示徽标。 */
export const describeContributionsTabBadge = (detail: ExhibitionDetail): TabBadge | null =>
  detail.pendingContributionCount > 0
    ? { label: String(detail.pendingContributionCount), dot: true }
    : null;

/** 地图 tab 徽标：已有位置记录的照片数（地图是可选的整理步骤，不阻断发布）。 */
export const describeMapTabBadge = (detail: ExhibitionDetail): TabBadge => ({
  label: String(detail.locations.length),
  dot: false,
});

/** 发布 tab 徽标：未发布 / 已发布 vN / 有修改（有未发布修改时 accent 圆点）。 */
export const describePublishTabBadge = (detail: ExhibitionDetail): TabBadge => {
  if (detail.publication === null) {
    return { label: "未发布", dot: false };
  }
  if (detail.hasUnpublishedChanges) {
    return { label: "有修改", dot: true };
  }
  return { label: `已发布 v${detail.publication.version}`, dot: false };
};

/** 网址 `?view=immersive`：三维场景沉浸观看（只在「三维场景」分区有效；刷新、后退都按网址恢复）。 */
export const WORKSPACE_VIEW_PARAM = "view";
export const IMMERSIVE_SCENE_VIEW = "immersive";

export const isImmersiveSceneView = (tabId: WorkspaceTabId, view: string | null): boolean =>
  tabId === "scene" && view === IMMERSIVE_SCENE_VIEW;

/** 在保留其它参数的前提下写入分区与是否沉浸观看。 */
export const withWorkspaceLocation = (
  params: URLSearchParams,
  tabId: WorkspaceTabId,
  immersive: boolean,
): URLSearchParams => {
  const next = new URLSearchParams(params);
  next.set(WORKSPACE_TAB_PARAM, tabId);
  if (immersive && tabId === "scene") {
    next.set(WORKSPACE_VIEW_PARAM, IMMERSIVE_SCENE_VIEW);
  } else {
    next.delete(WORKSPACE_VIEW_PARAM);
  }
  return next;
};
