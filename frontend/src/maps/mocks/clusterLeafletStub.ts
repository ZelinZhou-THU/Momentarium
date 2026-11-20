import type { LeafletClusterGroup, LeafletClusterOptions, LeafletWithClusters } from "../markerCluster";
import { createLeafletStub } from "./leafletStub";
import type {
  LeafletStubOptions,
  StubDivIconRecord,
  StubMapRecord,
  StubMarkerRecord,
  StubTileLayerRecord,
} from "./leafletStub";

/**
 * 「Leaflet + markercluster」可替换桩（仅供测试）：在 leafletStub 之上加一个记录用的
 * markerClusterGroup，验证聚类参数、标记加入/清理与销毁，不访问真实瓦片或 DOM。
 */
export interface StubClusterGroupRecord {
  readonly options: LeafletClusterOptions;
  addedToMap: boolean;
  readonly layers: StubMarkerRecord[];
  clearCount: number;
  removed: boolean;
}

export interface ClusterLeafletStub {
  readonly leaflet: LeafletWithClusters;
  readonly maps: StubMapRecord[];
  readonly tileLayers: StubTileLayerRecord[];
  readonly markers: StubMarkerRecord[];
  readonly clusterGroups: StubClusterGroupRecord[];
  readonly divIcons: StubDivIconRecord[];
}

export const createClusterLeafletStub = (
  stubOptions: LeafletStubOptions = {},
): ClusterLeafletStub => {
  const base = createLeafletStub(stubOptions);
  const clusterGroups: StubClusterGroupRecord[] = [];

  const leaflet: LeafletWithClusters = {
    ...base.leaflet,
    markerClusterGroup(options: LeafletClusterOptions): LeafletClusterGroup {
      const record: StubClusterGroupRecord = {
        options,
        addedToMap: false,
        layers: [],
        clearCount: 0,
        removed: false,
      };
      clusterGroups.push(record);
      const group: LeafletClusterGroup = {
        addTo() {
          record.addedToMap = true;
          return group;
        },
        addLayer(marker) {
          const markerRecord = base.markerRecords.get(marker);
          if (markerRecord !== undefined) {
            record.layers.push(markerRecord);
          }
          return group;
        },
        clearLayers() {
          record.clearCount += 1;
          return group;
        },
        remove() {
          record.removed = true;
        },
      };
      return group;
    },
  };

  return {
    leaflet,
    maps: base.maps,
    tileLayers: base.tileLayers,
    markers: base.markers,
    clusterGroups,
    divIcons: base.divIcons,
  };
};
