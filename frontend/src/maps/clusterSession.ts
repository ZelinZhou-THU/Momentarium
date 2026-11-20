import type { GeoPoint } from "../objects/gallery/GeoPoint";
import { computeMapViewport } from "./mapSession";
import type { LeafletMarker, LeafletMarkerOptions } from "./leaflet";
import type { LeafletClusterOptions, LeafletWithClusters } from "./markerCluster";
import { createClusterIconCreateFunction, createMapMarkerIcon } from "./markerIcon";
import { DEFAULT_MAP_TILE_CONFIG } from "./tileConfig";
import type { MapTileConfig } from "./tileConfig";

/** 足迹地图标记：位置点 + 点击弹窗 HTML（缩略图/地点名/展览名/公开链接）。 */
export interface ClusterMapMarker {
  readonly id: string;
  readonly point: GeoPoint;
  readonly label: string;
  readonly popupHtml: string;
}

/** 聚类参数：cluster 点击放大地图（v1 不做区域面板），同一批照片按屏幕距离聚合。 */
export const CLUSTER_MAP_OPTIONS: LeafletClusterOptions = {
  showCoverageOnHover: false,
  maxClusterRadius: 60,
  spiderfyOnMaxZoom: true,
  zoomToBoundsOnClick: true,
};

export interface ClusterSessionCallbacks {
  readonly onTileError?: () => void;
}

export interface ClusterSessionOptions {
  readonly tileConfig?: MapTileConfig;
}

export interface ClusterSession {
  syncMarkers(markers: readonly ClusterMapMarker[]): void;
  destroy(): void;
}

/**
 * 聚类参数 + 可选 token 聚合图标：divIcon 可用时给聚合数字气泡套项目 token 样式；
 * divIcon 不可用时保持 CLUSTER_MAP_OPTIONS 原样（MarkerCluster 默认图标回退）。
 * 聚类行为（点击放大、spiderfy、最大半径）不变。
 */
export const clusterOptionsFor = (
  iconCreateFunction: LeafletClusterOptions["iconCreateFunction"],
): LeafletClusterOptions =>
  iconCreateFunction === undefined
    ? CLUSTER_MAP_OPTIONS
    : { ...CLUSTER_MAP_OPTIONS, iconCreateFunction };

/**
 * 聚类地图会话：在组件边缘创建/销毁 Leaflet + markercluster 实例，按调用方给的标记重绘，
 * 不持有业务状态。首次同步时按全部标记取景；之后由用户缩放/聚类点击控制视野。
 */
export const createClusterSession = (
  leaflet: LeafletWithClusters,
  container: unknown,
  callbacks: ClusterSessionCallbacks,
  options: ClusterSessionOptions = {},
): ClusterSession => {
  const tileConfig = options.tileConfig ?? DEFAULT_MAP_TILE_CONFIG;
  const viewport = computeMapViewport([]);
  const map = leaflet.map(container, {
    center: viewport.center,
    zoom: viewport.zoom,
    scrollWheelZoom: true,
    attributionControl: true,
    zoomControl: true,
  });
  leaflet
    .tileLayer(tileConfig.tileUrl, {
      attribution: tileConfig.attribution,
      minZoom: tileConfig.minZoom,
      maxZoom: tileConfig.maxZoom,
    })
    .addTo(map)
    .on("tileerror", () => callbacks.onTileError?.());
  const clusterGroup = leaflet
    .markerClusterGroup(clusterOptionsFor(createClusterIconCreateFunction(leaflet) ?? undefined))
    .addTo(map);
  const markerIcon = createMapMarkerIcon(leaflet);

  let markers: readonly ClusterMapMarker[] = [];
  let rendered: LeafletMarker[] = [];
  let fitted = false;

  const clearMarkers = (): void => {
    rendered.forEach((marker) => marker.remove());
    rendered = [];
    clusterGroup.clearLayers();
  };

  const render = (): void => {
    clearMarkers();
    markers.forEach((marker) => {
      const markerOptions: LeafletMarkerOptions =
        markerIcon === null
          ? { title: marker.label, opacity: 1, riseOnHover: true }
          : { title: marker.label, opacity: 1, riseOnHover: true, icon: markerIcon };
      const layer = leaflet.marker(
        [marker.point.latitude, marker.point.longitude],
        markerOptions,
      );
      layer.bindPopup?.(marker.popupHtml);
      clusterGroup.addLayer(layer);
      rendered = [...rendered, layer];
    });
  };

  return {
    syncMarkers(nextMarkers) {
      markers = nextMarkers;
      render();
      if (!fitted && markers.length > 0) {
        const next = computeMapViewport(markers.map((marker) => marker.point));
        map.setView(next.center, next.zoom);
        fitted = true;
      }
    },
    destroy() {
      clearMarkers();
      clusterGroup.remove();
      map.remove();
    },
  };
};
