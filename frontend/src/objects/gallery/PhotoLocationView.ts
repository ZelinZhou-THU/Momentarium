import {
  requireNullable,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from "../../apis/shared/decode";

/**
 * 契约 §2.1 位置枚举（v1.7）：
 * - 来源 `LocationSource`：exif（上传时本地解析的建议）/ manual（作者手动标注或纠正）/ ai（阶段 3）；
 * - 状态 `LocationStatus`：suggested（待确认建议）/ confirmed（作者已确认）；unknown 用“没有位置记录”表示；
 * - 公开粒度 `LocationGranularity`：hidden（不公开）/ area（公开范围代表点）/ exact（公开精确点）。
 */
export type LocationSource = "exif" | "manual" | "ai";
export type LocationStatus = "suggested" | "confirmed";
export type LocationGranularity = "hidden" | "area" | "exact";

const LOCATION_SOURCES: readonly LocationSource[] = ["exif", "manual", "ai"];
const LOCATION_STATUSES: readonly LocationStatus[] = ["suggested", "confirmed"];
/** 封闭枚举值集合：解析器与跨页面装配（作者主页足迹）共用，避免两处各写一份。 */
export const LOCATION_GRANULARITY_VALUES: readonly LocationGranularity[] = [
  "hidden",
  "area",
  "exact",
];

/** 契约 §2.1 PhotoLocationView：作者草稿视图里的一张照片位置（suggested/confirmed 都返回）。 */
export interface PhotoLocationView {
  readonly photoId: string;
  readonly source: LocationSource;
  readonly status: LocationStatus;
  readonly name: string;
  /** WGS84；允许 null（只有地名或用例未取到坐标），但必须与 longitude 成对为空。 */
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly granularity: LocationGranularity;
}

export const parsePhotoLocationView = (
  value: unknown,
  path = "photoLocation",
): PhotoLocationView => {
  const record = requireObject(value, path);
  return {
    photoId: requireString(record.photoId, `${path}.photoId`),
    source: requireOneOf(record.source, LOCATION_SOURCES, `${path}.source`),
    status: requireOneOf(record.status, LOCATION_STATUSES, `${path}.status`),
    name: requireString(record.name, `${path}.name`),
    latitude: requireNullable(record.latitude, `${path}.latitude`, requireNumber),
    longitude: requireNullable(record.longitude, `${path}.longitude`, requireNumber),
    granularity: requireOneOf(record.granularity, LOCATION_GRANULARITY_VALUES, `${path}.granularity`),
  };
};
