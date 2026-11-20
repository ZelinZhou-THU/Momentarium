import type {
  Leaflet,
  LeafletCircleOptions,
  LeafletDivIconOptions,
  LeafletIcon,
  LeafletLayerGroup,
  LeafletMap,
  LeafletMapOptions,
  LeafletMarker,
  LeafletMarkerOptions,
  LeafletTileLayer,
  LeafletTileLayerOptions,
} from "../leaflet";

/**
 * Leaflet 可替换桩（仅供测试）：记录创建的地图/瓦片/标记与事件回调，
 * 测试用它验证地图会话行为，不访问真实瓦片服务，也不需要 DOM 环境。
 */
export interface StubMapRecord {
  readonly container: unknown;
  readonly options: LeafletMapOptions;
  readonly views: Array<{ readonly center: readonly [number, number]; readonly zoom: number | undefined }>;
  readonly panToCalls: Array<readonly [number, number]>;
  readonly clickHandlers: Array<(event: unknown) => void>;
  removed: boolean;
  zoom: number;
}

export interface StubTileLayerRecord {
  readonly url: string;
  readonly options: LeafletTileLayerOptions;
  readonly tileErrorHandlers: Array<() => void>;
}

export interface StubMarkerRecord {
  readonly kind: "marker" | "circleMarker";
  readonly center: readonly [number, number];
  readonly options: LeafletMarkerOptions | LeafletCircleOptions;
  readonly clickHandlers: Array<() => void>;
  /** bindPopup 传入的 HTML（聚类地图用）。 */
  readonly popups: string[];
  /** marker 使用的自定义图标；null 表示用 Leaflet 默认 marker 图标。 */
  readonly icon: LeafletIcon | null;
  addedToGroup: boolean;
  removed: boolean;
}

export interface StubDivIconRecord {
  readonly options: LeafletDivIconOptions;
}

export interface StubGroupRecord {
  addedToMap: boolean;
  clearCount: number;
  layers: StubMarkerRecord[];
}

export interface LeafletStub {
  readonly leaflet: Leaflet;
  readonly maps: StubMapRecord[];
  readonly tileLayers: StubTileLayerRecord[];
  readonly markers: StubMarkerRecord[];
  readonly groups: StubGroupRecord[];
  readonly divIcons: StubDivIconRecord[];
  /** LeafletMarker 对象 → 记录（聚类桩把 addLayer 的标记映射回记录）。 */
  readonly markerRecords: Map<LeafletMarker, StubMarkerRecord>;
}

export interface LeafletStubOptions {
  /** 是否提供 divIcon（默认 true）；false 用于验证调用方回退路径。 */
  readonly divIcon?: boolean;
}

export const createLeafletStub = (stubOptions: LeafletStubOptions = {}): LeafletStub => {
  const maps: StubMapRecord[] = [];
  const tileLayers: StubTileLayerRecord[] = [];
  const markers: StubMarkerRecord[] = [];
  const groups: StubGroupRecord[] = [];
  const divIcons: StubDivIconRecord[] = [];
  const markerRecords = new Map<LeafletMarker, StubMarkerRecord>();

  const createMarker = (
    kind: "marker" | "circleMarker",
    center: readonly [number, number],
    options: LeafletMarkerOptions | LeafletCircleOptions,
  ): LeafletMarker => {
    const record: StubMarkerRecord = {
      kind,
      center,
      options,
      clickHandlers: [],
      popups: [],
      icon: "icon" in options ? options.icon ?? null : null,
      addedToGroup: false,
      removed: false,
    };
    markers.push(record);
    const marker: LeafletMarker = {
      addTo() {
        record.addedToGroup = true;
        return marker;
      },
      on(event, handler) {
        if (event === "click") {
          record.clickHandlers.push(handler);
        }
        return marker;
      },
      bindPopup(html: string) {
        record.popups.push(html);
        return marker;
      },
      remove() {
        record.removed = true;
      },
    };
    markerRecords.set(marker, record);
    return marker;
  };

  const leaflet: Leaflet = {
    map(container: unknown, options: LeafletMapOptions): LeafletMap {
      const record: StubMapRecord = {
        container,
        options,
        views: [],
        panToCalls: [],
        clickHandlers: [],
        removed: false,
        zoom: options.zoom,
      };
      maps.push(record);
      const map: LeafletMap = {
        setView(center, zoom) {
          record.views.push({ center, zoom });
          if (zoom !== undefined) {
            record.zoom = zoom;
          }
          return map;
        },
        panTo(center) {
          record.panToCalls.push(center);
          return map;
        },
        getZoom() {
          return record.zoom;
        },
        on(event, handler) {
          if (event === "click") {
            record.clickHandlers.push(handler);
          }
          return map;
        },
        off(event, handler) {
          if (event === "click") {
            const index = record.clickHandlers.indexOf(handler);
            if (index >= 0) {
              record.clickHandlers.splice(index, 1);
            }
          }
          return map;
        },
        invalidateSize() {
          return map;
        },
        remove() {
          record.removed = true;
        },
      };
      return map;
    },

    tileLayer(url: string, options: LeafletTileLayerOptions): LeafletTileLayer {
      const record: StubTileLayerRecord = { url, options, tileErrorHandlers: [] };
      tileLayers.push(record);
      const layer: LeafletTileLayer = {
        addTo() {
          return layer;
        },
        on(event, handler) {
          if (event === "tileerror") {
            record.tileErrorHandlers.push(handler);
          }
          return layer;
        },
      };
      return layer;
    },

    layerGroup() {
      const record: StubGroupRecord = { addedToMap: false, clearCount: 0, layers: [] };
      groups.push(record);
      const group: LeafletLayerGroup = {
        addTo() {
          record.addedToMap = true;
          return group;
        },
        addLayer() {
          return group;
        },
        clearLayers() {
          record.clearCount += 1;
          return group;
        },
      };
      return group;
    },

    marker(center, options) {
      return createMarker("marker", center, options);
    },

    circleMarker(center, options) {
      return createMarker("circleMarker", center, options);
    },

    ...(stubOptions.divIcon === false
      ? {}
      : {
          divIcon(options: LeafletDivIconOptions): LeafletIcon {
            divIcons.push({ options });
            return {};
          },
        }),
  };

  return { leaflet, maps, tileLayers, markers, groups, divIcons, markerRecords };
};
