import { requireNumber, requireObject, requireOneOf, requireString } from "../../apis/shared/decode";

/**
 * 契约 §2.1 PublicPhotoLocation（v1.7）：公开页只读地图的已发布位置。
 * 只出现 confirmed 且 granularity != hidden 的位置；`area` 是作者确认的范围代表点，
 * 不含原始精确坐标。旧快照没有 locations 时公开视图返回空数组（由 PublicExhibitionView 处理）。
 */
export type PublicLocationGranularity = "area" | "exact";

/** 公开位置只允许 area/exact；作者主页足迹（v1.8）复用同一封闭集合。 */
export const PUBLIC_LOCATION_GRANULARITY_VALUES: readonly PublicLocationGranularity[] = [
  "area",
  "exact",
];

export interface PublicPhotoLocation {
  readonly photoId: string;
  readonly name: string;
  readonly granularity: PublicLocationGranularity;
  /** WGS84；公开位置必须有坐标（area 为范围代表点）。 */
  readonly latitude: number;
  readonly longitude: number;
}

export const parsePublicPhotoLocation = (
  value: unknown,
  path = "publicPhotoLocation",
): PublicPhotoLocation => {
  const record = requireObject(value, path);
  return {
    photoId: requireString(record.photoId, `${path}.photoId`),
    name: requireString(record.name, `${path}.name`),
    granularity: requireOneOf(
      record.granularity,
      PUBLIC_LOCATION_GRANULARITY_VALUES,
      `${path}.granularity`,
    ),
    latitude: requireNumber(record.latitude, `${path}.latitude`),
    longitude: requireNumber(record.longitude, `${path}.longitude`),
  };
};
