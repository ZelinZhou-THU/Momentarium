import type { LocationGranularity, PhotoLocationView } from "../../../../../objects/gallery/PhotoLocationView";
import type { MapFallbackHint } from "../objects/MapPanelState";

export interface GranularityOption {
  readonly value: LocationGranularity;
  readonly label: string;
  readonly description: string;
}

/** 公开粒度选项（与契约 hidden/area/exact 一一对应；文案解释公开页会看到什么）。 */
export const LOCATION_GRANULARITY_OPTIONS: readonly GranularityOption[] = [
  { value: "hidden", label: "不公开", description: "只在草稿里记录，公开页不显示这个地点。" },
  {
    value: "area",
    label: "公开范围",
    description: "公开页只显示大致范围（用这个代表点），不显示原始精确坐标。",
  },
  { value: "exact", label: "公开精确点", description: "公开页显示这个精确坐标。" },
];

export const describeLocationSource = (source: PhotoLocationView["source"]): string => {
  switch (source) {
    case "exif":
      return "EXIF 建议";
    case "manual":
      return "手动标注";
    case "ai":
      return "AI 候选";
  }
};

/** 一行位置状态文案：未知 / 待确认建议 / 已确认 + 公开粒度。 */
export const describeLocationStatus = (location: PhotoLocationView | null): string => {
  if (location === null) {
    return "未定位";
  }
  if (location.status === "suggested") {
    return `推测位置 · 待确认（${describeLocationSource(location.source)}）`;
  }
  switch (location.granularity) {
    case "hidden":
      return "已确认 · 不公开";
    case "area":
      return "已确认 · 公开范围";
    case "exact":
      return "已确认 · 公开精确点";
  }
};

/** 列表里的第二行：有地名就显示地名，只有坐标时显示坐标，都没有时提示录入。 */
export const describeLocationSummary = (location: PhotoLocationView | null): string => {
  if (location === null) {
    return "还没有位置";
  }
  const name = location.name.trim();
  if (name.length > 0) {
    return name;
  }
  if (location.latitude !== null && location.longitude !== null) {
    return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  }
  return "只有定位记录，没有名称与坐标";
};

/**
 * 地图降级提示（离线/加载失败时退回位置列表与编辑，不阻断其他功能）：
 * - 未开启：说明在线地图是可选项；
 * - 加载失败或断网：明确“列表与编辑仍可用”，不把地图当错误态遮住整块分区。
 */
export const describeMapFallbackHint = (
  availability: "closed" | "loading" | "ready" | "failed",
  online: boolean,
): MapFallbackHint | null => {
  switch (availability) {
    case "loading":
      return null;
    case "closed":
      return {
        tone: "info",
        message: online
          ? "在线地图是可选项：开启后会加载 OpenStreetMap 公共瓦片；位置列表与编辑不依赖地图。"
          : "当前网络不可用：位置名称与已保存坐标仍可在列表中查看和编辑。",
      };
    case "ready":
      return online
        ? null
        : {
            tone: "warning",
            message: "网络已断开：底图可能无法加载，位置列表与编辑不受影响。",
          };
    case "failed":
      return {
        tone: "warning",
        message: online
          ? "在线地图未能加载，已退回位置列表与编辑；可重试加载地图。"
          : "当前网络不可用，在线地图不可用；位置列表与编辑不受影响。",
      };
  }
};

/** 地图落点提示（只有在启用地图且选中照片时显示）。 */
export const MAP_PICK_HINT = "在地图上点击空白处，可把该点坐标填入下方的位置编辑。";
