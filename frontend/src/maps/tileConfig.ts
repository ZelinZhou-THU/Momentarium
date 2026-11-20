/**
 * 地图瓦片配置（计划 §3.1）：默认 OSM Standard 栅格瓦片，URL 与署名可通过构建环境变量替换，
 * 不把提供方写死在前端代码里。瓦片请求不得携带令牌、照片或回忆数据（这里只配置基础 URL）。
 */
export interface MapTileConfig {
  readonly tileUrl: string;
  readonly attribution: string;
  readonly minZoom: number;
  readonly maxZoom: number;
}

/** OSM 官方标准瓦片（低流量课程演示用；公共瓦片无可用性保证，署名必须可见）。 */
export const DEFAULT_MAP_TILE_CONFIG: MapTileConfig = {
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "© OpenStreetMap contributors",
  minZoom: 1,
  maxZoom: 19,
};

/** 允许覆盖的子集（VITE_ 前缀由 Vite 注入；测试直接传普通对象）。 */
export interface MapTileEnv {
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_MAP_TILE_ATTRIBUTION?: string;
  readonly VITE_MAP_TILE_MIN_ZOOM?: string;
  readonly VITE_MAP_TILE_MAX_ZOOM?: string;
}

const nonEmpty = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

const zoomOrDefault = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

/** 纯函数：环境变量覆盖默认瓦片配置；缺失或非法值回退默认，保证地图始终有可用配置。 */
export const resolveMapTileConfig = (env: MapTileEnv): MapTileConfig => {
  const tileUrl = nonEmpty(env.VITE_MAP_TILE_URL) ?? DEFAULT_MAP_TILE_CONFIG.tileUrl;
  const attribution =
    nonEmpty(env.VITE_MAP_TILE_ATTRIBUTION) ?? DEFAULT_MAP_TILE_CONFIG.attribution;
  const minZoom = clamp(
    zoomOrDefault(env.VITE_MAP_TILE_MIN_ZOOM, DEFAULT_MAP_TILE_CONFIG.minZoom),
    0,
    19,
  );
  const maxZoom = clamp(
    zoomOrDefault(env.VITE_MAP_TILE_MAX_ZOOM, DEFAULT_MAP_TILE_CONFIG.maxZoom),
    minZoom,
    22,
  );
  return { tileUrl, attribution, minZoom, maxZoom };
};

/** 当前构建的地图瓦片配置（供 MapView 默认值使用）。 */
const readEnvString = (name: string): string | undefined => {
  const value: unknown = import.meta.env[name];
  return typeof value === "string" ? value : undefined;
};

export const readMapTileConfig = (): MapTileConfig =>
  resolveMapTileConfig({
    VITE_MAP_TILE_URL: readEnvString("VITE_MAP_TILE_URL"),
    VITE_MAP_TILE_ATTRIBUTION: readEnvString("VITE_MAP_TILE_ATTRIBUTION"),
    VITE_MAP_TILE_MIN_ZOOM: readEnvString("VITE_MAP_TILE_MIN_ZOOM"),
    VITE_MAP_TILE_MAX_ZOOM: readEnvString("VITE_MAP_TILE_MAX_ZOOM"),
  });
