import type { Leaflet, LeafletDivIconOptions, LeafletIcon } from "./leaflet";
import type { LeafletCluster } from "./markerCluster";

/**
 * maps 内共享的 marker 图标配置（作者主页聚类地图与工作台/公开页地图的 point 标记共用一份）：
 * 透明容器 + 项目 token 圆点（night 底、surface 描边、shadow-sm），纯 DOM/CSS，不依赖图片资源。
 * 尺寸 24×24、锚点居中、弹窗在圆点上方 12px。
 */
export const MAP_MARKER_ICON_OPTIONS: LeafletDivIconOptions = {
  className: "bg-transparent border-0",
  html: '<span class="flex h-6 w-6 items-center justify-center bg-transparent"><span class="block h-3 w-3 rounded-md border-2 border-surface bg-night shadow-sm"></span></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
};

/**
 * 共享图标工厂：优先用 divIcon；替换实现（旧桩等）没有 divIcon 时返回 null，
 * 调用方回退普通 marker，保证地图仍可工作。
 */
export const createMapMarkerIcon = (leaflet: Leaflet): LeafletIcon | null =>
  leaflet.divIcon?.(MAP_MARKER_ICON_OPTIONS) ?? null;

export type ClusterIconTier = "small" | "medium" | "large";

export interface ClusterIconSpec {
  readonly iconSize: readonly [number, number];
  /** 数字字号（项目字号 token）；三档颜色完全一致，只用尺寸与字号区分。 */
  readonly textClass: string;
}

/**
 * 聚合数字气泡分档：1–9 / 10–99 / 100+。
 * 颜色统一 night 底 + surface 数字/描边 + shadow-sm；圆形用内联 `border-radius:50%`
 * （Tailwind 配置只有 md/xl 两档圆角 token，圆形没有对应类名，因此在这里做最小内联）。
 */
export const CLUSTER_ICON_SPECS: Readonly<Record<ClusterIconTier, ClusterIconSpec>> = {
  small: { iconSize: [32, 32], textClass: "text-caption" },
  medium: { iconSize: [38, 38], textClass: "text-body" },
  large: { iconSize: [44, 44], textClass: "text-h2" },
};

export const clusterIconTierOf = (count: number): ClusterIconTier =>
  count < 10 ? "small" : count < 100 ? "medium" : "large";

/** 由聚合数量生成 token 化的 divIcon 配置（保留原始数字显示）。 */
export const clusterIconOptionsOf = (count: number): LeafletDivIconOptions => {
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
  const spec = CLUSTER_ICON_SPECS[clusterIconTierOf(safeCount)];
  const [width, height] = spec.iconSize;
  return {
    className: "bg-transparent border-0",
    html: `<span style="border-radius:50%" class="flex h-full w-full items-center justify-center border-2 border-surface bg-night font-serif ${spec.textClass} font-medium text-surface shadow-sm">${safeCount}</span>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
    popupAnchor: [0, -height / 2],
  };
};

/**
 * 聚合图标工厂：divIcon 可用时返回 markercluster 需要的 iconCreateFunction（token 数字气泡）；
 * 不可用时返回 null，调用方不传该选项、沿用 MarkerCluster 自带样式作为回退。
 */
export const createClusterIconCreateFunction = (
  leaflet: Leaflet,
): ((cluster: LeafletCluster) => LeafletIcon) | null => {
  const divIcon = leaflet.divIcon;
  if (divIcon === undefined) {
    return null;
  }
  return (cluster) => divIcon.call(leaflet, clusterIconOptionsOf(cluster.getChildCount()));
};
