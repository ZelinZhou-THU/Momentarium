/**
 * WGS84 地理点（契约 §2.1 位置约定：内部统一 WGS84，坐标必须成对、有限且在合法范围内）。
 * 只做值校验与装配，不承担地图显示职责；地图封装见 `src/maps`。
 */
export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export const LATITUDE_LIMIT = 90;
export const LONGITUDE_LIMIT = 180;

export const isValidLatitude = (value: number): boolean =>
  Number.isFinite(value) && Math.abs(value) <= LATITUDE_LIMIT;

export const isValidLongitude = (value: number): boolean =>
  Number.isFinite(value) && Math.abs(value) <= LONGITUDE_LIMIT;

/**
 * 位置值里的经纬度是可空对：任一为空、非有限数或越界时视为“未知”（返回 null），
 * 与契约“无记录/无坐标 = unknown”的语义一致，不做静默纠正。
 */
export const geoPointOrNull = (
  latitude: number | null,
  longitude: number | null,
): GeoPoint | null => {
  if (latitude === null || longitude === null) {
    return null;
  }
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }
  return { latitude, longitude };
};
