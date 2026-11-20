import { isRecord } from "../apis/shared/decode";
import { isLeaflet } from "./leaflet";
import type { Leaflet, LeafletIcon, LeafletMarker, LeafletMap } from "./leaflet";

/**
 * Leaflet.markercluster 的最小结构接口（与 leaflet.ts 同一策略：页面只看到需要的几个方法，
 * 测试用普通对象做可替换桩，不访问真实瓦片与真实 DOM）。
 */
/** 插件传给 iconCreateFunction 的最小聚合簇信息。 */
export interface LeafletCluster {
  getChildCount(): number;
}

export interface LeafletClusterOptions {
  readonly showCoverageOnHover: boolean;
  readonly maxClusterRadius: number;
  readonly spiderfyOnMaxZoom: boolean;
  readonly zoomToBoundsOnClick: boolean;
  /** 自定义聚合数字图标；缺省时用 MarkerCluster 自带样式（回退）。 */
  readonly iconCreateFunction?: (cluster: LeafletCluster) => LeafletIcon;
}

export interface LeafletClusterGroup {
  addTo(map: LeafletMap): LeafletClusterGroup;
  addLayer(marker: LeafletMarker): LeafletClusterGroup;
  clearLayers(): LeafletClusterGroup;
  remove(): void;
}

export interface LeafletWithClusters extends Leaflet {
  markerClusterGroup(options: LeafletClusterOptions): LeafletClusterGroup;
}

const isFunction = (value: unknown): boolean => typeof value === "function";

/** 运行期窄化：插件是否成功挂到 Leaflet 上（umd 插件可能加载失败或未注入全局 L）。 */
export const isLeafletWithClusters = (value: unknown): value is LeafletWithClusters =>
  isLeaflet(value) && isRecord(value) && isFunction(value.markerClusterGroup);

export type ClusterLoader = () => Promise<unknown>;

/** 聚类插件在浏览器里按 UMD 方式查找全局 L；动态 import 前注入同一份 Leaflet 实例。 */
const exposeGlobalLeaflet = (leaflet: unknown): void => {
  Object.assign(globalThis, { L: leaflet });
};

/**
 * 默认加载器：Leaflet + markercluster 插件 + 两份必要样式全部按需动态加载
 * （leaflet.css、MarkerCluster.css、MarkerCluster.Default.css），不进入首屏主包，
 * 也不在足迹地图真正可见前请求瓦片。
 */
export const importClusterLeaflet: ClusterLoader = async () => {
  const [leafletModule] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
  const leaflet: unknown =
    isRecord(leafletModule) && isRecord(leafletModule.default) ? leafletModule.default : leafletModule;
  exposeGlobalLeaflet(leaflet);
  await Promise.all([
    import("leaflet.markercluster"),
    import("leaflet.markercluster/dist/MarkerCluster.css"),
    import("leaflet.markercluster/dist/MarkerCluster.Default.css"),
  ]);
  return leaflet;
};

export type ClusterLoadResult =
  | { readonly status: "ready"; readonly leaflet: LeafletWithClusters }
  | { readonly status: "failed"; readonly message: string };

export const CLUSTER_MAP_LOAD_FAILED_MESSAGE =
  "足迹地图未能加载，已改为按展览分组的位置列表。";

const unwrapModuleDefault = (loaded: unknown): unknown =>
  isRecord(loaded) && isRecord(loaded.default) ? loaded.default : loaded;

/** 加载并校验「Leaflet + 聚类插件」：失败一律转成可降级的结果。 */
export const resolveClusterLeaflet = async (
  loader: ClusterLoader,
): Promise<ClusterLoadResult> => {
  const loaded = await loader().catch(() => null);
  if (loaded === null) {
    return { status: "failed", message: CLUSTER_MAP_LOAD_FAILED_MESSAGE };
  }
  const candidate = unwrapModuleDefault(loaded);
  if (!isLeafletWithClusters(candidate)) {
    return { status: "failed", message: CLUSTER_MAP_LOAD_FAILED_MESSAGE };
  }
  return { status: "ready", leaflet: candidate };
};
