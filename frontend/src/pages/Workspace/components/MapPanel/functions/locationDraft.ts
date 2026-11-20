import { isValidLatitude, isValidLongitude } from "../../../../../objects/gallery/GeoPoint";
import type { GeoPoint } from "../../../../../objects/gallery/GeoPoint";
import type { PhotoLocationView } from "../../../../../objects/gallery/PhotoLocationView";
import type { PlaceCandidate } from "../../../../../objects/gallery/PlaceSearchResponse";
import type { LocationDraft, LocationDraftErrors } from "../objects/MapPanelState";

/** 契约 v1.7：地点名称去首尾空白后 1–120 个 Unicode 码点。 */
export const MAX_LOCATION_NAME_CODE_POINTS = 120;

const codePointLength = (value: string): number => [...value].length;

const coordinateText = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

/** 由已有位置（或空）生成编辑草稿；没有坐标时两个输入都为空。 */
export const createLocationDraft = (
  photoId: string,
  location: PhotoLocationView | null,
): LocationDraft => ({
  photoId,
  name: location?.name ?? "",
  latitude: coordinateText(location?.latitude),
  longitude: coordinateText(location?.longitude),
  granularity: location?.granularity ?? "hidden",
});

/** 搜索候选填入草稿：名称优先候选短名，坐标转成字符串（不改变已选公开粒度）。 */
export const applyPlaceCandidate = (
  draft: LocationDraft,
  candidate: PlaceCandidate,
): LocationDraft => ({
  ...draft,
  name: candidate.name.trim() === "" ? candidate.displayName : candidate.name,
  latitude: String(candidate.latitude),
  longitude: String(candidate.longitude),
});

/** 地图落点填入草稿：只更新坐标，不擅自改公开粒度。 */
export const applyMapPoint = (draft: LocationDraft, point: GeoPoint): LocationDraft => ({
  ...draft,
  latitude: point.latitude.toFixed(6),
  longitude: point.longitude.toFixed(6),
});

const parseCoordinate = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export type LocationDraftValidation =
  | {
      readonly ok: true;
      readonly name: string;
      /** area/exact 一定有坐标；hidden 时可以为 null（只标地名）。 */
      readonly point: GeoPoint | null;
      readonly errors: LocationDraftErrors;
    }
  | { readonly ok: false; readonly errors: LocationDraftErrors };

/**
 * 保存前校验（与契约 reason 对齐）：
 * 名称去首尾空白后 1–120 码点；坐标成对、有限、范围内；area/exact 必须有坐标。
 */
export const validateLocationDraft = (draft: LocationDraft): LocationDraftValidation => {
  const name = draft.name.trim();
  const nameError =
    name.length === 0
      ? "请填写地点名称"
      : codePointLength(name) > MAX_LOCATION_NAME_CODE_POINTS
        ? `地点名称不能超过 ${MAX_LOCATION_NAME_CODE_POINTS} 个字`
        : null;

  const latitudeText = draft.latitude.trim();
  const longitudeText = draft.longitude.trim();
  const latitude = parseCoordinate(draft.latitude);
  const longitude = parseCoordinate(draft.longitude);
  const hasLatitude = latitudeText !== "";
  const hasLongitude = longitudeText !== "";

  const coordinateError = ((): string | null => {
    if (hasLatitude !== hasLongitude) {
      return "经纬度必须成对填写（或都留空）";
    }
    if (!hasLatitude) {
      return null;
    }
    if (latitude === null || !isValidLatitude(latitude)) {
      return "纬度无效：需为 -90 到 90 之间的数字";
    }
    if (longitude === null || !isValidLongitude(longitude)) {
      return "经度无效：需为 -180 到 180 之间的数字";
    }
    return null;
  })();

  const point =
    coordinateError === null && latitude !== null && longitude !== null
      ? { latitude, longitude }
      : null;
  const granularityError =
    draft.granularity !== "hidden" && point === null
      ? "公开范围或精确点必须有坐标（可在地图上选点或搜索地点）"
      : null;

  const errors: LocationDraftErrors = {
    name: nameError,
    coordinates: coordinateError,
    granularity: granularityError,
  };
  return nameError === null && coordinateError === null && granularityError === null
    ? { ok: true, name, point, errors }
    : { ok: false, errors };
};
