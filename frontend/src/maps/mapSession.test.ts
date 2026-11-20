import { describe, expect, it, vi } from "vitest";
import {
  computeMapViewport,
  createMapSession,
  DEFAULT_MAP_COLORS,
  DEFAULT_MAP_VIEWPORT,
  markerStyleOf,
  readMapColors,
  toCssColor,
} from "./mapSession";
import type { MapMarker } from "./mapSession";
import { createLeafletStub } from "./mocks/leafletStub";
import { MAP_MARKER_ICON_OPTIONS } from "./markerIcon";
import { DEFAULT_MAP_TILE_CONFIG } from "./tileConfig";

const george = { latitude: 33.4589, longitude: 126.9365 };
const jeju = { latitude: 33.4996, longitude: 126.5312 };

const sampleMarkers = (): readonly MapMarker[] => [
  { id: "photo-1", point: george, label: "涉地可支", shape: "point", emphasis: "confirmed" },
  { id: "photo-2", point: jeju, label: "济州岛", shape: "area", emphasis: "suggested" },
];

const noop = (): void => {};

describe("地图数据装配（纯函数）", () => {
  it("没有标记时用默认视野；单点用最高缩放；跨洲时缩小", () => {
    expect(computeMapViewport([])).toEqual(DEFAULT_MAP_VIEWPORT);

    const single = computeMapViewport([george]);
    expect(single.center).toEqual([george.latitude, george.longitude]);
    expect(single.zoom).toBe(14);

    const world = computeMapViewport([
      { latitude: -30, longitude: -120 },
      { latitude: 60, longitude: 120 },
    ]);
    expect(world.zoom).toBe(3);
    expect(world.center).toEqual([15, 0]);
  });

  it("确认的精确点是普通标记；推测位置是虚线空心圆；范围是更大的圆", () => {
    const confirmed = markerStyleOf(sampleMarkers()[0]!, false, DEFAULT_MAP_COLORS);
    expect(confirmed.shape).toBe("point");
    if (confirmed.shape === "point") {
      expect(confirmed.options.title).toBe("涉地可支");
      expect(confirmed.options.opacity).toBe(1);
    }

    const suggested = markerStyleOf(sampleMarkers()[1]!, false, DEFAULT_MAP_COLORS);
    expect(suggested.shape).toBe("area");
    if (suggested.shape === "area") {
      expect(suggested.options.dashArray).toBe("4 4");
      expect(suggested.options.radius).toBe(18);
      expect(suggested.options.color).toBe(DEFAULT_MAP_COLORS.muted);
    }

    const suggestedPoint = markerStyleOf(
      { id: "photo-4", point: george, label: "推测点", shape: "point", emphasis: "suggested" },
      false,
      DEFAULT_MAP_COLORS,
    );
    expect(suggestedPoint.shape).toBe("area");
    if (suggestedPoint.shape === "area") {
      expect(suggestedPoint.options.radius).toBe(10);
      expect(suggestedPoint.options.dashArray).toBe("4 4");
    }

    const area = markerStyleOf(
      { id: "photo-3", point: jeju, label: "范围", shape: "area", emphasis: "confirmed" },
      false,
      DEFAULT_MAP_COLORS,
    );
    expect(area.shape).toBe("area");
    if (area.shape === "area") {
      expect(area.options.radius).toBe(18);
      expect(area.options.color).toBe(DEFAULT_MAP_COLORS.accent);
    }
  });

  it("颜色 token 只接受 RGB 通道，否则回退默认", () => {
    expect(toCssColor("140 90 59", "#000000")).toBe("rgb(140 90 59)");
    expect(toCssColor(" 140  90  59 ", "#000000")).toBe("rgb(140  90  59)");
    expect(toCssColor("#8C5A3B", "#000000")).toBe("#000000");
    expect(toCssColor("", "#000000")).toBe("#000000");
  });

  it("无 DOM 环境读取主题色时回退默认配色", () => {
    expect(readMapColors(null)).toEqual(DEFAULT_MAP_COLORS);
  });
});

describe("地图会话（Leaflet 桩驱动）", () => {
  it("创建地图时启用署名、滚轮缩放，并按配置加载瓦片", () => {
    const stub = createLeafletStub();
    createMapSession(stub.leaflet, {}, { onMarkerSelect: noop });

    expect(stub.maps).toHaveLength(1);
    const map = stub.maps[0]!;
    expect(map.options.attributionControl).toBe(true);
    expect(map.options.scrollWheelZoom).toBe(true);
    expect(stub.tileLayers).toHaveLength(1);
    expect(stub.tileLayers[0]!.url).toBe(DEFAULT_MAP_TILE_CONFIG.tileUrl);
    expect(stub.tileLayers[0]!.options.attribution).toBe(DEFAULT_MAP_TILE_CONFIG.attribution);
    expect(stub.groups[0]!.addedToMap).toBe(true);
  });

  it("同步标记：首次自动取景，标记点击回传 photoId，重建时移除旧标记", () => {
    const stub = createLeafletStub();
    const onMarkerSelect = vi.fn();
    const session = createMapSession(stub.leaflet, {}, { onMarkerSelect });

    session.syncMarkers(sampleMarkers(), null);
    expect(stub.markers.map((marker) => marker.kind)).toEqual(["marker", "circleMarker"]);
    expect(stub.maps[0]!.views).toHaveLength(1);
    expect(stub.maps[0]!.views[0]!.center).toEqual([
      (george.latitude + jeju.latitude) / 2,
      (george.longitude + jeju.longitude) / 2,
    ]);

    stub.markers[0]!.clickHandlers[0]!();
    expect(onMarkerSelect).toHaveBeenCalledWith("photo-1");

    const firstRound = [...stub.markers];
    session.syncMarkers([sampleMarkers()[1]!], null);
    expect(firstRound.every((marker) => marker.removed)).toBe(true);
    expect(stub.maps[0]!.views).toHaveLength(1);
  });

  it("point 标记使用共享 token divIcon；范围/推测点仍用 circleMarker 且不使用图标", () => {
    const stub = createLeafletStub();
    const session = createMapSession(stub.leaflet, {}, { onMarkerSelect: noop });
    session.syncMarkers(sampleMarkers(), null);

    expect(stub.divIcons).toHaveLength(1);
    expect(stub.divIcons[0]!.options).toEqual(MAP_MARKER_ICON_OPTIONS);

    const pointMarker = stub.markers.find((marker) => marker.kind === "marker");
    expect(pointMarker?.icon).not.toBeNull();

    const circles = stub.markers.filter((marker) => marker.kind === "circleMarker");
    expect(circles.length).toBeGreaterThan(0);
    expect(circles.every((marker) => marker.icon === null)).toBe(true);
  });

  it("divIcon 不可用时 point 标记回退普通 marker（旧桩/替换实现兼容）", () => {
    const stub = createLeafletStub({ divIcon: false });
    const session = createMapSession(stub.leaflet, {}, { onMarkerSelect: noop });
    session.syncMarkers(sampleMarkers(), null);

    expect(stub.divIcons).toHaveLength(0);
    const pointMarker = stub.markers.find((marker) => marker.kind === "marker");
    expect(pointMarker?.icon).toBeNull();
    expect(stub.markers.filter((marker) => marker.kind === "circleMarker").length).toBeGreaterThan(0);
  });

  it("地图空白处点击回传 WGS84 坐标，非法事件忽略", () => {
    const stub = createLeafletStub();
    const onMapClick = vi.fn();
    createMapSession(stub.leaflet, {}, { onMarkerSelect: noop, onMapClick });

    stub.maps[0]!.clickHandlers[0]!({ latlng: { lat: 33.46, lng: 126.94 } });
    expect(onMapClick).toHaveBeenCalledWith({ latitude: 33.46, longitude: 126.94 });

    stub.maps[0]!.clickHandlers[0]!({ type: "click" });
    expect(onMapClick).toHaveBeenCalledTimes(1);
  });

  it("选中标记时放大/加深样式；focusMarker 平移到该点并保持可读缩放", () => {
    const stub = createLeafletStub();
    const session = createMapSession(stub.leaflet, {}, { onMarkerSelect: noop });
    session.syncMarkers(sampleMarkers(), "photo-2");

    const selected = stub.markers.filter((marker) => marker.center[0] === jeju.latitude);
    const areaSelected = selected[selected.length - 1]!;
    expect(areaSelected.options).toMatchObject({ radius: 24, weight: 3 });

    session.focusMarker("photo-1");
    const lastView = stub.maps[0]!.views[stub.maps[0]!.views.length - 1]!;
    expect(lastView.center).toEqual([george.latitude, george.longitude]);
    expect(lastView.zoom).toBe(Math.max(stub.maps[0]!.zoom, 11));

    session.focusMarker("missing");
    expect(stub.maps[0]!.views[stub.maps[0]!.views.length - 1]).toBe(lastView);
  });

  it("瓦片错误上报给外层；销毁时解绑点击、移除标记与地图", () => {
    const stub = createLeafletStub();
    const onTileError = vi.fn();
    const session = createMapSession(stub.leaflet, {}, { onMarkerSelect: noop, onTileError });

    stub.tileLayers[0]!.tileErrorHandlers[0]!();
    expect(onTileError).toHaveBeenCalledTimes(1);

    session.syncMarkers(sampleMarkers(), null);
    session.destroy();
    expect(stub.maps[0]!.removed).toBe(true);
    expect(stub.maps[0]!.clickHandlers).toHaveLength(0);
    expect(stub.markers.every((marker) => marker.removed)).toBe(true);
  });
});
