import { isRecord } from "../apis/shared/decode";
import { geoPointOrNull } from "../objects/gallery/GeoPoint";
import type { GeoPoint } from "../objects/gallery/GeoPoint";

/**
 * Leaflet 的最小结构接口：只在 `src/maps` 里使用，不把整个 @types/leaflet 的 API 面暴露给页面，
 * 这样测试可以用普通对象做可替换桩（不访问真实瓦片服务），页面也只看到地图需要的几个方法。
 */
export interface LeafletMapOptions {
  readonly center: readonly [number, number];
  readonly zoom: number;
  readonly scrollWheelZoom: boolean;
  readonly attributionControl: boolean;
  readonly zoomControl: boolean;
}

export interface LeafletTileLayerOptions {
  readonly attribution: string;
  readonly minZoom: number;
  readonly maxZoom: number;
}

/** opaque 的图标句柄：只在 maps 内部透传给 marker，不暴露 @types/leaflet 的完整图标 API。 */
export interface LeafletIcon {
  readonly __leafletIcon?: never;
}

export interface LeafletDivIconOptions {
  readonly html: string;
  readonly className: string;
  readonly iconSize: readonly [number, number];
  readonly iconAnchor: readonly [number, number];
  readonly popupAnchor: readonly [number, number];
}

export interface LeafletMarkerOptions {
  readonly title: string;
  readonly opacity: number;
  readonly riseOnHover: boolean;
  /** 自定义图标；缺省时 Leaflet 会用内置默认图标（依赖 marker-icon.png 图片资源，避免使用）。 */
  readonly icon?: LeafletIcon;
}

export interface LeafletCircleOptions {
  readonly radius: number;
  readonly color: string;
  readonly fillColor: string;
  readonly fillOpacity: number;
  readonly weight: number;
  readonly opacity: number;
  readonly dashArray: string | null;
}

export interface LeafletMap {
  setView(center: readonly [number, number], zoom?: number): LeafletMap;
  panTo(center: readonly [number, number]): LeafletMap;
  getZoom(): number;
  on(event: "click", handler: (event: unknown) => void): LeafletMap;
  off(event: "click", handler: (event: unknown) => void): LeafletMap;
  invalidateSize(): void;
  remove(): void;
}

export interface LeafletMarker {
  addTo(target: LeafletLayerGroup): LeafletMarker;
  on(event: "click", handler: () => void): LeafletMarker;
  /** 点击标记时打开 HTML 弹窗（聚类地图用；普通地图会话不调用）。 */
  bindPopup?(html: string): LeafletMarker;
  remove(): void;
}

export interface LeafletLayerGroup {
  addTo(map: LeafletMap): LeafletLayerGroup;
  addLayer(layer: LeafletMarker): LeafletLayerGroup;
  clearLayers(): LeafletLayerGroup;
}

export interface LeafletTileLayer {
  addTo(map: LeafletMap): LeafletTileLayer;
  on(event: "tileerror", handler: () => void): LeafletTileLayer;
}

export interface Leaflet {
  map(container: unknown, options: LeafletMapOptions): LeafletMap;
  tileLayer(url: string, options: LeafletTileLayerOptions): LeafletTileLayer;
  layerGroup(): LeafletLayerGroup;
  marker(center: readonly [number, number], options: LeafletMarkerOptions): LeafletMarker;
  circleMarker(center: readonly [number, number], options: LeafletCircleOptions): LeafletMarker;
  /**
   * 生成自定义 marker 图标（可选）：旧桩/替换实现可以没有，
   * 调用方必须在缺失时回退到默认 marker。运行期窄化不强制要求它。
   */
  divIcon?(options: LeafletDivIconOptions): LeafletIcon;
}

const isFunction = (value: unknown): boolean => typeof value === "function";

/** 运行期窄化：地图库可替换，加载结果必须证明自己具备需要的方法才使用。 */
export const isLeaflet = (value: unknown): value is Leaflet =>
  isRecord(value) &&
  isFunction(value.map) &&
  isFunction(value.tileLayer) &&
  isFunction(value.layerGroup) &&
  isFunction(value.marker) &&
  isFunction(value.circleMarker);

/** 地图点击事件的坐标（Leaflet 的 click 事件携带 latlng）；不是合法点时返回 null。 */
export const readMapClickPoint = (event: unknown): GeoPoint | null => {
  if (!isRecord(event) || !isRecord(event.latlng)) {
    return null;
  }
  const { lat, lng } = event.latlng;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }
  return geoPointOrNull(lat, lng);
};

export type LeafletLoader = () => Promise<unknown>;

/**
 * 默认加载器：Leaflet 与 leaflet.css 都按需动态加载（样式例外仅此一份），
 * 不进入首屏主包，也不在未打开地图时请求瓦片。
 */
export const importLeaflet: LeafletLoader = async () => {
  const [module] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
  return module;
};

export type LeafletLoadResult =
  | { readonly status: "ready"; readonly leaflet: Leaflet }
  | { readonly status: "failed"; readonly message: string };

export const MAP_LOAD_FAILED_MESSAGE =
  "在线地图未能加载，位置列表与编辑仍可继续使用。请检查网络后重试。";

const unwrapModuleDefault = (loaded: unknown): unknown =>
  isRecord(loaded) && isRecord(loaded.default) ? loaded.default : loaded;

/** 加载并校验 Leaflet：失败（网络、动态 import 报错、结构不符）一律转成可展示的失败结果。 */
export const resolveLeaflet = async (loader: LeafletLoader): Promise<LeafletLoadResult> => {
  const loaded = await loader().catch(() => null);
  if (loaded === null) {
    return { status: "failed", message: MAP_LOAD_FAILED_MESSAGE };
  }
  const candidate = unwrapModuleDefault(loaded);
  if (!isLeaflet(candidate)) {
    return { status: "failed", message: MAP_LOAD_FAILED_MESSAGE };
  }
  return { status: "ready", leaflet: candidate };
};
