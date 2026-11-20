import type { GeoPoint } from "../objects/gallery/GeoPoint";
import type {
  Leaflet,
  LeafletCircleOptions,
  LeafletMarker,
  LeafletMarkerOptions,
} from "./leaflet";
import { readMapClickPoint } from "./leaflet";
import { createMapMarkerIcon } from "./markerIcon";
import { DEFAULT_MAP_TILE_CONFIG } from "./tileConfig";
import type { MapTileConfig } from "./tileConfig";

/** 地图标记形状：point=精确点，area=范围（公开粒度 area 或作者确认的范围代表点）。 */
export type MapMarkerShape = "point" | "area";
/** 作者侧标记的确认状态：推测位置用弱化样式，确认位置用实色。 */
export type MapMarkerEmphasis = "suggested" | "confirmed";

export interface MapMarker {
  readonly id: string;
  readonly point: GeoPoint;
  readonly label: string;
  readonly shape: MapMarkerShape;
  readonly emphasis: MapMarkerEmphasis;
}

/** 地图标记颜色取自页面色彩 token（展览配色会覆盖它们）；读不到时用默认配色。 */
export interface MapColors {
  readonly accent: string;
  readonly muted: string;
  readonly surface: string;
}

export const DEFAULT_MAP_COLORS: MapColors = {
  accent: "#8C5A3B",
  muted: "#6F685E",
  surface: "#FFFDF9",
};

/** CSS 自定义属性值（R G B 通道）→ 可用颜色；不是三元通道时回退。 */
const RGB_CHANNELS_PATTERN = /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/;

export const toCssColor = (raw: string, fallback: string): string => {
  const trimmed = raw.trim();
  return RGB_CHANNELS_PATTERN.test(trimmed) ? `rgb(${trimmed})` : fallback;
};

const canReadComputedStyle = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.getComputedStyle === "function" &&
  typeof HTMLElement !== "undefined";

/** 从地图容器的计算样式读取主题色（服务端渲染/测试环境读不到时用默认色）。 */
export const readMapColors = (container: unknown): MapColors => {
  if (!canReadComputedStyle() || !(container instanceof HTMLElement)) {
    return DEFAULT_MAP_COLORS;
  }
  const style = window.getComputedStyle(container);
  return {
    accent: toCssColor(style.getPropertyValue("--color-accent"), DEFAULT_MAP_COLORS.accent),
    muted: toCssColor(style.getPropertyValue("--color-muted"), DEFAULT_MAP_COLORS.muted),
    surface: toCssColor(style.getPropertyValue("--color-surface"), DEFAULT_MAP_COLORS.surface),
  };
};

export interface MapViewport {
  readonly center: readonly [number, number];
  readonly zoom: number;
}

/** 没有标记时的默认视野（东亚附近，避免按某个展览写死城市）。 */
export const DEFAULT_MAP_VIEWPORT: MapViewport = { center: [30, 110], zoom: 3 };

const zoomForSpan = (span: number): number => {
  if (span <= 0.02) return 14;
  if (span <= 0.08) return 12;
  if (span <= 0.3) return 10;
  if (span <= 1) return 8;
  if (span <= 4) return 6;
  if (span <= 12) return 5;
  if (span <= 40) return 4;
  return 3;
};

/** 纯函数：由全部标记点算出一个能容纳它们的视野中心与缩放级别。 */
export const computeMapViewport = (points: readonly GeoPoint[]): MapViewport => {
  if (points.length === 0) {
    return DEFAULT_MAP_VIEWPORT;
  }
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const span = Math.max(maxLatitude - minLatitude, maxLongitude - minLongitude);
  return {
    center: [(minLatitude + maxLatitude) / 2, (minLongitude + maxLongitude) / 2],
    zoom: zoomForSpan(span),
  };
};

/**
 * 标记样式：确认的精确点用普通标记；推测位置用虚线空心圆；范围用大面积半透明圆。
 * 选中时加深描边/提高不透明度，不引入额外颜色。
 */
export const markerStyleOf = (
  marker: MapMarker,
  selected: boolean,
  colors: MapColors,
): { readonly shape: "point"; readonly options: LeafletMarkerOptions } | {
  readonly shape: "area";
  readonly options: LeafletCircleOptions;
} => {
  if (marker.shape === "point" && marker.emphasis === "confirmed") {
    return {
      shape: "point",
      options: { title: marker.label, opacity: 1, riseOnHover: true },
    };
  }
  const area = marker.shape === "area";
  const suggested = marker.emphasis === "suggested";
  const radius = area ? (selected ? 24 : 18) : selected ? 14 : 10;
  return {
    shape: "area",
    options: {
      radius,
      color: suggested ? colors.muted : colors.accent,
      fillColor: suggested ? colors.muted : colors.accent,
      fillOpacity: area ? (selected ? 0.35 : 0.22) : 0.3,
      weight: selected ? 3 : 2,
      opacity: suggested ? 0.75 : 0.95,
      dashArray: suggested ? "4 4" : null,
    },
  };
};

export interface MapSessionCallbacks {
  readonly onMarkerSelect: (markerId: string) => void;
  readonly onMapClick?: (point: GeoPoint) => void;
  readonly onTileError?: () => void;
}

export interface MapSessionOptions {
  readonly tileConfig?: MapTileConfig;
  readonly colors?: MapColors;
}

export interface MapSession {
  /** 更新标记集合与选中项（业务状态留在 React，这里只做地图边缘同步）。 */
  syncMarkers(markers: readonly MapMarker[], selectedMarkerId: string | null): void;
  /** 把视野移到某个标记（照片列表点选时用）。 */
  focusMarker(markerId: string): void;
  destroy(): void;
}

/**
 * 地图会话：在组件边缘创建/更新/销毁 Leaflet 实例；不持有业务状态，只按调用方给的标记重绘。
 * 每次 syncMarkers 重建标记（展览最多几十张照片，换取实现简单与不会泄漏事件监听）。
 */
export const createMapSession = (
  leaflet: Leaflet,
  container: unknown,
  callbacks: MapSessionCallbacks,
  options: MapSessionOptions = {},
): MapSession => {
  const tileConfig = options.tileConfig ?? DEFAULT_MAP_TILE_CONFIG;
  const colors = options.colors ?? DEFAULT_MAP_COLORS;
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
  const group = leaflet.layerGroup().addTo(map);
  // point 标记用共享 token divIcon（避免 Leaflet 默认 marker-icon.png 缺失导致破图）；
  // 替换实现没有 divIcon 时回退普通 marker，范围/推测点仍用 circleMarker。
  const markerIcon = createMapMarkerIcon(leaflet);

  const handleMapClick = (event: unknown): void => {
    const point = readMapClickPoint(event);
    if (point !== null) {
      callbacks.onMapClick?.(point);
    }
  };
  map.on("click", handleMapClick);

  let markers: readonly MapMarker[] = [];
  let selectedMarkerId: string | null = null;
  let rendered: LeafletMarker[] = [];
  let fitted = false;

  const clearMarkers = (): void => {
    rendered.forEach((marker) => marker.remove());
    rendered = [];
    group.clearLayers();
  };

  const render = (): void => {
    clearMarkers();
    markers.forEach((marker) => {
      const style = markerStyleOf(marker, marker.id === selectedMarkerId, colors);
      const center: readonly [number, number] = [marker.point.latitude, marker.point.longitude];
      const layer =
        style.shape === "point"
          ? leaflet.marker(
              center,
              markerIcon === null ? style.options : { ...style.options, icon: markerIcon },
            )
          : leaflet.circleMarker(center, style.options);
      layer.addTo(group);
      layer.on("click", () => callbacks.onMarkerSelect(marker.id));
      rendered = [...rendered, layer];
    });
  };

  return {
    syncMarkers(nextMarkers, nextSelectedMarkerId) {
      markers = nextMarkers;
      selectedMarkerId = nextSelectedMarkerId;
      render();
      if (!fitted && markers.length > 0) {
        const next = computeMapViewport(markers.map((marker) => marker.point));
        map.setView(next.center, next.zoom);
        fitted = true;
      }
    },
    focusMarker(markerId) {
      const marker = markers.find((candidate) => candidate.id === markerId);
      if (marker === undefined) {
        return;
      }
      map.setView(
        [marker.point.latitude, marker.point.longitude],
        Math.max(map.getZoom(), 11),
      );
    },
    destroy() {
      map.off("click", handleMapClick);
      clearMarkers();
      map.remove();
    },
  };
};
