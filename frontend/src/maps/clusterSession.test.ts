import { describe, expect, it, vi } from "vitest";
import { CLUSTER_MAP_OPTIONS, createClusterSession } from "./clusterSession";
import type { ClusterMapMarker } from "./clusterSession";
import { createMapMarkerIcon, MAP_MARKER_ICON_OPTIONS } from "./markerIcon";
import { createClusterLeafletStub } from "./mocks/clusterLeafletStub";
import { DEFAULT_MAP_TILE_CONFIG } from "./tileConfig";

const marker = (
  id: string,
  latitude: number,
  longitude: number,
  popupHtml = `<p>${id}</p>`,
): ClusterMapMarker => ({
  id,
  point: { latitude, longitude },
  label: id,
  popupHtml,
});

describe("聚类地图会话（Leaflet + markercluster 桩驱动）", () => {
  it("创建地图、OSM 瓦片与聚类图层；聚类点击放大的默认行为保持开启", () => {
    const stub = createClusterLeafletStub();
    createClusterSession(stub.leaflet, {}, {});

    expect(stub.maps).toHaveLength(1);
    expect(stub.maps[0]!.options.attributionControl).toBe(true);
    expect(stub.maps[0]!.options.scrollWheelZoom).toBe(true);
    expect(stub.tileLayers[0]!.url).toBe(DEFAULT_MAP_TILE_CONFIG.tileUrl);
    expect(stub.tileLayers[0]!.options.attribution).toBe(DEFAULT_MAP_TILE_CONFIG.attribution);

    expect(stub.clusterGroups).toHaveLength(1);
    expect(stub.clusterGroups[0]!.addedToMap).toBe(true);
    expect(stub.clusterGroups[0]!.options).toMatchObject(CLUSTER_MAP_OPTIONS);
    expect(typeof stub.clusterGroups[0]!.options.iconCreateFunction).toBe("function");
    expect(stub.clusterGroups[0]!.options.zoomToBoundsOnClick).toBe(true);
  });

  it("聚合数字气泡使用 token divIcon（1–9 / 10–99 / 100+ 三档），聚类行为不变", () => {
    const stub = createClusterLeafletStub();
    createClusterSession(stub.leaflet, {}, {});

    const options = stub.clusterGroups[0]!.options;
    expect(options.maxClusterRadius).toBe(CLUSTER_MAP_OPTIONS.maxClusterRadius);
    expect(options.spiderfyOnMaxZoom).toBe(true);
    expect(options.zoomToBoundsOnClick).toBe(true);

    const createIcon = options.iconCreateFunction;
    expect(createIcon).toBeDefined();
    const baseDivIcons = stub.divIcons.length;
    createIcon!({ getChildCount: () => 7 });
    createIcon!({ getChildCount: () => 42 });
    createIcon!({ getChildCount: () => 128 });

    const clusterIcons = stub.divIcons.slice(baseDivIcons);
    expect(clusterIcons.map((record) => record.options.iconSize)).toEqual([
      [32, 32],
      [38, 38],
      [44, 44],
    ]);
    expect(clusterIcons[0]!.options.html).toContain(">7<");
    expect(clusterIcons[1]!.options.html).toContain(">42<");
    expect(clusterIcons[2]!.options.html).toContain(">128<");
    expect(clusterIcons.every((record) => record.options.className.includes("bg-transparent"))).toBe(
      true,
    );
    expect(clusterIcons.every((record) => record.options.html.includes("bg-night"))).toBe(true);
  });

  it("同步标记：使用 token divIcon、加入聚类图层、绑定弹窗、首次自动取景；重建时清理旧标记", () => {
    const stub = createClusterLeafletStub();
    const session = createClusterSession(stub.leaflet, {}, {});
    session.syncMarkers([marker("a", 33.45, 126.9, "<p>A 弹窗</p>"), marker("b", 33.5, 126.5)]);

    expect(stub.markers).toHaveLength(2);
    expect(stub.markers[0]!.popups).toEqual(["<p>A 弹窗</p>"]);
    expect(stub.clusterGroups[0]!.layers).toHaveLength(2);
    expect(stub.maps[0]!.views).toHaveLength(1);
    expect(stub.maps[0]!.views[0]!.center).toEqual([
      (33.45 + 33.5) / 2,
      (126.9 + 126.5) / 2,
    ]);

    const firstRound = [...stub.markers];
    session.syncMarkers([marker("b", 33.5, 126.5)]);
    expect(firstRound.every((record) => record.removed)).toBe(true);
    expect(stub.clusterGroups[0]!.clearCount).toBeGreaterThanOrEqual(1);
    expect(stub.clusterGroups[0]!.layers).toHaveLength(3);
    expect(stub.maps[0]!.views).toHaveLength(1);
  });

  it("标记优先用项目 token divIcon，不依赖 Leaflet 默认 marker 图片资源", () => {
    const stub = createClusterLeafletStub();
    const session = createClusterSession(stub.leaflet, {}, {});
    session.syncMarkers([marker("a", 33.45, 126.9), marker("b", 33.5, 126.5)]);

    expect(stub.divIcons).toHaveLength(1);
    expect(stub.divIcons[0]!.options).toEqual(MAP_MARKER_ICON_OPTIONS);

    const options = stub.divIcons[0]!.options;
    expect(options.className).toContain("bg-transparent");
    expect(options.className).toContain("border-0");
    expect(options.html).toContain("bg-night");
    expect(options.html).toContain("border-surface");
    expect(options.html).toContain("shadow-sm");
    expect(options.iconSize).toEqual([24, 24]);
    expect(options.iconAnchor).toEqual([12, 12]);
    expect(options.popupAnchor).toEqual([0, -12]);

    // 每个 marker 都显式带 icon，且复用同一个实例：不会再落到默认 Icon（marker-icon.png）。
    expect(stub.markers.every((record) => record.icon !== null)).toBe(true);
    expect(new Set(stub.markers.map((record) => record.icon)).size).toBe(1);
  });

  it("divIcon 不可用时回退普通 marker（旧桩/替换实现兼容），弹窗仍可用", () => {
    const stub = createClusterLeafletStub({ divIcon: false });
    expect(createMapMarkerIcon(stub.leaflet)).toBeNull();

    const session = createClusterSession(stub.leaflet, {}, {});
    session.syncMarkers([marker("a", 33.45, 126.9)]);
    expect(stub.markers).toHaveLength(1);
    expect(stub.markers[0]!.icon).toBeNull();
    expect(stub.markers[0]!.popups).toHaveLength(1);
    expect(stub.divIcons).toHaveLength(0);
    // 聚合簇不传 iconCreateFunction，沿用 MarkerCluster 默认图标。
    expect(stub.clusterGroups[0]!.options.iconCreateFunction).toBeUndefined();
    expect(stub.clusterGroups[0]!.options).toEqual(CLUSTER_MAP_OPTIONS);
  });

  it("瓦片错误上报给页面；销毁时清理标记、聚类图层与地图", () => {
    const stub = createClusterLeafletStub();
    const onTileError = vi.fn();
    const session = createClusterSession(stub.leaflet, {}, { onTileError });
    session.syncMarkers([marker("a", 33.45, 126.9)]);

    stub.tileLayers[0]!.tileErrorHandlers[0]!();
    expect(onTileError).toHaveBeenCalledTimes(1);

    session.destroy();
    expect(stub.clusterGroups[0]!.removed).toBe(true);
    expect(stub.maps[0]!.removed).toBe(true);
    expect(stub.markers.every((record) => record.removed)).toBe(true);
  });
});
