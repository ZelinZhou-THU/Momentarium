import type { MapMarker } from "../../../../../maps/mapSession";
import type { LocationRow } from "./buildLocationRows";

/**
 * 页面行 → 地图标记（纯函数）：
 * - 只有坐标合法的行才上地图；
 * - 公开粒度为 area 的画范围圆，其余画点；
 * - 未确认的 EXIF/AI 建议用弱化样式（推测），作者确认过的用实色。
 */
export const buildLocationMarkers = (rows: readonly LocationRow[]): readonly MapMarker[] =>
  rows.flatMap((row) => {
    if (row.point === null) {
      return [];
    }
    const label = row.location?.name.trim() ?? "";
    return [
      {
        id: row.photoId,
        point: row.point,
        label: label.length > 0 ? label : row.label,
        shape: row.location?.granularity === "area" ? "area" : "point",
        emphasis: row.location?.status === "suggested" ? "suggested" : "confirmed",
      },
    ];
  });

/** 地图上当前要突出显示的标记（选中行有坐标时）。 */
export const selectedMarkerIdOf = (row: LocationRow | null): string | null =>
  row === null || row.point === null ? null : row.photoId;
