import { geoPointOrNull } from "../../../objects/gallery/GeoPoint";
import type { GeoPoint } from "../../../objects/gallery/GeoPoint";
import type { MapMarker } from "../../../maps/mapSession";
import type { PlaceCandidate } from "../../../objects/gallery/PlaceSearchResponse";
import type { ContributionLocationFields } from "../objects/ContributionLocationFields";

/** 地图控件的三态加上"未开启"：投稿者地点字段里的地图只在需要时才加载。 */
export type ContributionMapAvailability = "closed" | "loading" | "ready" | "failed";

/** 编辑器里没有地点时的空字段。 */
export const EMPTY_LOCATION_FIELDS: ContributionLocationFields = {
  name: "",
  latitude: "",
  longitude: "",
};

const coordinateText = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

/** 由已有投稿的地点（或空）生成表单字段；没有坐标时两个输入都为空。 */
export const locationFieldsOf = (
  location: {
    readonly name: string;
    readonly latitude: number | null;
    readonly longitude: number | null;
  } | null,
): ContributionLocationFields =>
  location === null
    ? EMPTY_LOCATION_FIELDS
    : {
        name: location.name,
        latitude: coordinateText(location.latitude),
        longitude: coordinateText(location.longitude),
      };

/** 搜索结果填入：名称优先候选短名，坐标一并填上。 */
export const applyPlaceCandidateToFields = (
  candidate: PlaceCandidate,
): ContributionLocationFields => ({
  name: candidate.name.trim() === "" ? candidate.displayName : candidate.name,
  latitude: String(candidate.latitude),
  longitude: String(candidate.longitude),
});

/** 地图落点填入：只更新坐标，不擅自改已填的名称。 */
export const applyMapPointToFields = (
  fields: ContributionLocationFields,
  point: GeoPoint,
): ContributionLocationFields => ({
  ...fields,
  latitude: point.latitude.toFixed(6),
  longitude: point.longitude.toFixed(6),
});

/** 字段里当前合法的坐标点（用来在地图上画标记）；半填或越界视为没有。 */
export const pointOfFields = (fields: ContributionLocationFields): GeoPoint | null => {
  const latitude = Number(fields.latitude.trim());
  const longitude = Number(fields.longitude.trim());
  return fields.latitude.trim() === "" || fields.longitude.trim() === ""
    ? null
    : geoPointOrNull(latitude, longitude);
};

/** 地图上唯一的"已选位置"标记 id。 */
export const PICKED_MARKER_ID = "contribution-location";

/** 字段 → 地图标记（纯函数；没有合法坐标时不画）。 */
export const pickedMarkersOf = (
  name: string,
  latitude: string,
  longitude: string,
): readonly MapMarker[] => {
  const point = pointOfFields({ name, latitude, longitude });
  return point === null
    ? []
    : [
        {
          id: PICKED_MARKER_ID,
          point,
          label: name.trim() === "" ? "已选位置" : name.trim(),
          shape: "point",
          emphasis: "confirmed",
        },
      ];
};

/** 落点后的提醒：有坐标但名称为空时，提交前需要补名称。 */
export const describeMissingPlaceName = (fields: ContributionLocationFields): string | null =>
  pointOfFields(fields) !== null && fields.name.trim() === ""
    ? "已选了坐标，请再给这个地点起个名字（提交时必须有名称）。"
    : null;

/** 地图降级提示：地图不可用时搜索与手填坐标仍然可用。 */
export const describeContributionMapHint = (
  availability: ContributionMapAvailability,
  online: boolean,
): string | null => {
  switch (availability) {
    case "failed":
      return online
        ? "在线地图未能加载；仍可搜索地点或直接填写坐标。"
        : "当前网络不可用，在线地图不可用；仍可直接填写地点名称与坐标。";
    case "ready":
      return online ? null : "网络已断开：底图可能无法加载，仍可直接填写坐标。";
    case "closed":
    case "loading":
      return null;
  }
};

/** 地图落点提示。 */
export const CONTRIBUTION_MAP_PICK_HINT = "在地图上点击任意位置，可把该点坐标填入上方。";
