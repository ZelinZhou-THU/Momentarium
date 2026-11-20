import { geoPointOrNull } from "../../../objects/gallery/GeoPoint";
import type { GeoPoint } from "../../../objects/gallery/GeoPoint";
import type { PhotoLocationView } from "../../../objects/gallery/PhotoLocationView";
import type { PublicPhotoLocation } from "../../../objects/gallery/PublicPhotoLocation";
import type { MapMarker } from "../../../maps/mapSession";
import type { PublicExhibitionView, PublicPhotoView } from "./publicShowDtos";

/** 公开地图的一行：公开位置 + 对应快照照片 + 合法坐标。 */
export interface PublicMapLocation {
  readonly location: PublicPhotoLocation;
  readonly photo: PublicPhotoView;
  readonly point: GeoPoint;
}

/**
 * 作者草稿位置 → 公开投影（纯函数）：
 * 只有 confirmed 且 granularity != hidden 的位置会公开；没有合法坐标的跳过；
 * 顺序按传入的照片顺序（发布快照的照片顺序）。
 */
export const projectPublicLocations = (
  locations: readonly PhotoLocationView[],
  photoIds: readonly string[],
): readonly PublicPhotoLocation[] => {
  const locationsByPhotoId = new Map(
    locations.map((location): [string, PhotoLocationView] => [location.photoId, location]),
  );
  return photoIds.flatMap((photoId): readonly PublicPhotoLocation[] => {
    const location = locationsByPhotoId.get(photoId);
    if (
      location === undefined ||
      location.status !== "confirmed" ||
      location.granularity === "hidden"
    ) {
      return [];
    }
    const point = geoPointOrNull(location.latitude, location.longitude);
    if (point === null) {
      return [];
    }
    return [
      {
        photoId,
        name: location.name,
        granularity: location.granularity,
        latitude: point.latitude,
        longitude: point.longitude,
      },
    ];
  });
};

/**
 * 公开页地图数据装配（纯函数）：把公开视图的 locations 与快照照片关联起来；
 * 防御性过滤快照中不存在的照片、重复 photoId 与非法坐标。
 * 数组为空 = 这场展览没有可公开的位置（正常空态，不是错误）。
 */
export const buildPublicMapLocations = (
  exhibition: PublicExhibitionView,
): readonly PublicMapLocation[] => {
  const photosById = new Map(
    exhibition.photos.map((photo): [string, PublicPhotoView] => [photo.id, photo]),
  );
  const seen = new Set<string>();
  return exhibition.locations.flatMap((location): readonly PublicMapLocation[] => {
    const photo = photosById.get(location.photoId);
    const point = geoPointOrNull(location.latitude, location.longitude);
    if (photo === undefined || point === null || seen.has(location.photoId)) {
      return [];
    }
    seen.add(location.photoId);
    return [{ location, photo, point }];
  });
};

/**
 * 公开地图状态提示：断网或瓦片加载失败时说明原因与仍可用的操作（章节/大图），
 * 不把地图失败当成整页错误。
 */
export const describePublicMapStatus = (
  availability: "idle" | "loading" | "ready" | "failed",
  online: boolean,
): string | null => {
  if (!online) {
    return "网络不可用：公开地图可能无法加载；仍可在「章节」里浏览照片与图注。";
  }
  switch (availability) {
    case "idle":
    case "loading":
    case "ready":
      return null;
    case "failed":
      return "公开地图暂时无法加载；可切回「章节」继续浏览，或稍后重试。";
  }
};

/** 公开页地图标记装配：area 画范围、exact 画点；全部是已发布确认位置。 */
export const buildPublicMapMarkers = (
  rows: readonly PublicMapLocation[],
): readonly MapMarker[] =>
  rows.map((row) => ({
    id: row.photo.id,
    point: row.point,
    label: row.location.name.trim() !== "" ? row.location.name : row.photo.caption,
    shape: row.location.granularity === "area" ? "area" : "point",
    emphasis: "confirmed",
  }));
