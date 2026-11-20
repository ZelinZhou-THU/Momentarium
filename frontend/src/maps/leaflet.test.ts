import { describe, expect, it } from "vitest";
import { isLeaflet, MAP_LOAD_FAILED_MESSAGE, readMapClickPoint, resolveLeaflet } from "./leaflet";
import { createLeafletStub } from "./mocks/leafletStub";

describe("Leaflet 可替换加载（不访问真实瓦片服务）", () => {
  it("结构完整的桩被视为 Leaflet；缺方法或非对象被拒绝；divIcon 不是必需方法", () => {
    const stub = createLeafletStub();
    expect(isLeaflet(stub.leaflet)).toBe(true);
    // divIcon 是可选能力：旧桩/替换实现没有它时仍是可用 Leaflet，由调用方回退。
    expect(isLeaflet(createLeafletStub({ divIcon: false }).leaflet)).toBe(true);
    expect(isLeaflet({})).toBe(false);
    expect(isLeaflet(null)).toBe(false);
    expect(isLeaflet({ map: 1 })).toBe(false);
  });

  it("加载成功时返回可用的 Leaflet（兼容 ESM default 包装）", async () => {
    const stub = createLeafletStub();
    const direct = await resolveLeaflet(async () => stub.leaflet);
    expect(direct.status).toBe("ready");
    if (direct.status === "ready") {
      expect(direct.leaflet).toBe(stub.leaflet);
    }

    const wrapped = await resolveLeaflet(async () => ({ default: stub.leaflet }));
    expect(wrapped.status).toBe("ready");
  });

  it("动态 import 失败或结构不符时给出可展示的降级结果", async () => {
    const rejected = await resolveLeaflet(async () => {
      throw new Error("network down");
    });
    expect(rejected).toEqual({ status: "failed", message: MAP_LOAD_FAILED_MESSAGE });

    const malformed = await resolveLeaflet(async () => ({ default: { map: "nope" } }));
    expect(malformed.status).toBe("failed");
  });

  it("地图点击事件只有合法 latlng 才转成 GeoPoint", () => {
    expect(readMapClickPoint({ latlng: { lat: 33.4589, lng: 126.9365 } })).toEqual({
      latitude: 33.4589,
      longitude: 126.9365,
    });
    expect(readMapClickPoint({ latlng: { lat: "33", lng: 126 } })).toBeNull();
    expect(readMapClickPoint({ latlng: { lat: 100, lng: 126 } })).toBeNull();
    expect(readMapClickPoint({})).toBeNull();
    expect(readMapClickPoint(null)).toBeNull();
  });
});
