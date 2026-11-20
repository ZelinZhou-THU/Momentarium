import { describe, expect, it } from "vitest";
import {
  clusterIconOptionsOf,
  clusterIconTierOf,
  CLUSTER_ICON_SPECS,
  createClusterIconCreateFunction,
  createMapMarkerIcon,
  MAP_MARKER_ICON_OPTIONS,
} from "./markerIcon";
import { createLeafletStub } from "./mocks/leafletStub";

describe("maps 共享 marker 图标（divIcon）", () => {
  it("配置为透明容器 + 项目 token 圆点，24×24 居中，弹窗上移 12px", () => {
    expect(MAP_MARKER_ICON_OPTIONS.className).toContain("bg-transparent");
    expect(MAP_MARKER_ICON_OPTIONS.className).toContain("border-0");
    expect(MAP_MARKER_ICON_OPTIONS.html).toContain("bg-night");
    expect(MAP_MARKER_ICON_OPTIONS.html).toContain("border-surface");
    expect(MAP_MARKER_ICON_OPTIONS.html).toContain("shadow-sm");
    expect(MAP_MARKER_ICON_OPTIONS.iconSize).toEqual([24, 24]);
    expect(MAP_MARKER_ICON_OPTIONS.iconAnchor).toEqual([12, 12]);
    expect(MAP_MARKER_ICON_OPTIONS.popupAnchor).toEqual([0, -12]);
  });

  it("工厂优先走 divIcon；不可用时返回 null 供调用方回退", () => {
    const stub = createLeafletStub();
    expect(createMapMarkerIcon(stub.leaflet)).not.toBeNull();
    expect(stub.divIcons).toHaveLength(1);
    expect(stub.divIcons[0]!.options).toEqual(MAP_MARKER_ICON_OPTIONS);

    expect(createMapMarkerIcon(createLeafletStub({ divIcon: false }).leaflet)).toBeNull();
  });
});

describe("聚合数字气泡（token divIcon）", () => {
  it("1–9 / 10–99 / 100+ 三档尺寸与字号，颜色统一 night/surface/shadow", () => {
    expect(clusterIconTierOf(1)).toBe("small");
    expect(clusterIconTierOf(9)).toBe("small");
    expect(clusterIconTierOf(10)).toBe("medium");
    expect(clusterIconTierOf(99)).toBe("medium");
    expect(clusterIconTierOf(100)).toBe("large");
    expect(CLUSTER_ICON_SPECS.small.iconSize).toEqual([32, 32]);
    expect(CLUSTER_ICON_SPECS.medium.iconSize).toEqual([38, 38]);
    expect(CLUSTER_ICON_SPECS.large.iconSize).toEqual([44, 44]);

    const small = clusterIconOptionsOf(7);
    expect(small.iconSize).toEqual([32, 32]);
    expect(small.iconAnchor).toEqual([16, 16]);
    expect(small.popupAnchor).toEqual([0, -16]);
    expect(small.className).toContain("bg-transparent");
    expect(small.className).toContain("border-0");
    for (const expected of [
      "border-radius:50%",
      "bg-night",
      "border-surface",
      "text-surface",
      "shadow-sm",
      "font-serif",
      "text-caption",
      ">7<",
    ]) {
      expect(small.html).toContain(expected);
    }

    const medium = clusterIconOptionsOf(42);
    expect(medium.iconSize).toEqual([38, 38]);
    expect(medium.html).toContain("text-body");
    expect(medium.html).toContain(">42<");

    const large = clusterIconOptionsOf(128);
    expect(large.iconSize).toEqual([44, 44]);
    expect(large.html).toContain("text-h2");
    expect(large.html).toContain(">128<");

    // 三档颜色/描边/阴影完全一致（只用尺寸和字号区分）。
    for (const options of [small, medium, large]) {
      expect(options.html).toContain("bg-night");
      expect(options.html).toContain("border-surface");
      expect(options.html).toContain("text-surface");
      expect(options.html).toContain("shadow-sm");
    }
  });

  it("数量非法时至少显示 1，避免空簇", () => {
    expect(clusterIconOptionsOf(0).html).toContain(">1<");
    expect(clusterIconOptionsOf(Number.NaN).html).toContain(">1<");
  });

  it("工厂：divIcon 可用时返回 iconCreateFunction，按 getChildCount 生成 token 图标；缺失时返回 null", () => {
    const stub = createLeafletStub();
    const createIcon = createClusterIconCreateFunction(stub.leaflet);
    expect(createIcon).not.toBeNull();

    createIcon?.({ getChildCount: () => 42 });
    expect(stub.divIcons).toHaveLength(1);
    expect(stub.divIcons[0]!.options.iconSize).toEqual([38, 38]);
    expect(stub.divIcons[0]!.options.html).toContain(">42<");

    expect(createClusterIconCreateFunction(createLeafletStub({ divIcon: false }).leaflet)).toBeNull();
  });
});
