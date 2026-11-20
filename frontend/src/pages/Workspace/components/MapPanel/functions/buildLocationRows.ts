import { geoPointOrNull } from "../../../../../objects/gallery/GeoPoint";
import type { GeoPoint } from "../../../../../objects/gallery/GeoPoint";
import type { ExhibitionDetail } from "../../../../../objects/gallery/ExhibitionDetail";
import type { PhotoLocationView } from "../../../../../objects/gallery/PhotoLocationView";
import { photoLabel } from "../../../../../objects/gallery/photoLabel";

/** 地图分区的一张照片行：照片本身 + 它的位置记录（无记录 = 未知）。 */
export interface LocationRow {
  readonly photoId: string;
  /** 照片的统一称呼（图注 → 原文件名），与照片/策展分区一致。 */
  readonly label: string;
  readonly thumbUrl: string;
  readonly location: PhotoLocationView | null;
  /** 只有坐标合法成对时才有值（地图标记与“在地图上定位”用）。 */
  readonly point: GeoPoint | null;
}

const byPosition = (left: number | null, right: number | null): number =>
  (left ?? 0) - (right ?? 0);

/**
 * 按详情里的展示顺序（章节 position → 组内 positionInGroup → 未分组）装配地图数据：
 * 每张照片一行，位置按 photoId 关联；无记录的照片保留在列表里，标为“未定位”。
 */
export const buildLocationRows = (detail: ExhibitionDetail): readonly LocationRow[] => {
  const locationsByPhotoId = new Map(
    detail.locations.map((location): [string, PhotoLocationView] => [location.photoId, location]),
  );
  const orderedPhotos = [...detail.groups]
    .sort((left, right) => left.position - right.position)
    .flatMap((group) =>
      [...group.photos].sort((left, right) =>
        byPosition(left.positionInGroup, right.positionInGroup),
      ),
    )
    .concat(detail.ungroupedPhotos);

  return orderedPhotos.map((photo) => {
    const location = locationsByPhotoId.get(photo.id) ?? null;
    return {
      photoId: photo.id,
      label: photoLabel(photo),
      thumbUrl: photo.thumbUrl,
      location,
      point: location === null ? null : geoPointOrNull(location.latitude, location.longitude),
    };
  });
};

/** 已有位置记录的照片数（地图分区页头计数）。 */
export const countLocatedRows = (rows: readonly LocationRow[]): number =>
  rows.filter((row) => row.location !== null).length;

/** 有坐标、可以放到地图上的行。 */
export const rowsWithPoints = (rows: readonly LocationRow[]): readonly LocationRow[] =>
  rows.filter((row) => row.point !== null);

/** 默认选中第一张已有位置的照片；没有位置时选第一张，便于顺手录入。 */
export const defaultSelectedPhotoId = (rows: readonly LocationRow[]): string | null =>
  (rows.find((row) => row.location !== null) ?? rows[0])?.photoId ?? null;
