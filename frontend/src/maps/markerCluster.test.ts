import { describe, expect, it } from "vitest";
import { isLeafletWithClusters, resolveClusterLeaflet } from "./markerCluster";
import { createClusterLeafletStub } from "./mocks/clusterLeafletStub";
import { createLeafletStub } from "./mocks/leafletStub";

describe("Leaflet + markercluster 可替换加载（不访问真实瓦片/插件）", () => {
  it("带 markerClusterGroup 的桩被视为可用；普通 Leaflet 或空对象被拒绝", () => {
    expect(isLeafletWithClusters(createClusterLeafletStub().leaflet)).toBe(true);
    expect(isLeafletWithClusters(createLeafletStub().leaflet)).toBe(false);
    expect(isLeafletWithClusters({})).toBe(false);
    expect(isLeafletWithClusters(null)).toBe(false);
  });

  it("加载成功返回可用的聚类 Leaflet（兼容 ESM default 包装）", async () => {
    const stub = createClusterLeafletStub();
    const direct = await resolveClusterLeaflet(async () => stub.leaflet);
    expect(direct.status).toBe("ready");

    const wrapped = await resolveClusterLeaflet(async () => ({ default: stub.leaflet }));
    expect(wrapped.status).toBe("ready");
  });

  it("动态 import 失败或插件未挂载时给出可降级结果", async () => {
    const rejected = await resolveClusterLeaflet(async () => {
      throw new Error("network down");
    });
    expect(rejected.status).toBe("failed");
    if (rejected.status === "failed") {
      expect(rejected.message).toContain("按展览分组的位置列表");
    }

    // 只有原生 Leaflet、没有 markercluster：不能把没有聚类的模块当成可用。
    const withoutPlugin = await resolveClusterLeaflet(async () => createLeafletStub().leaflet);
    expect(withoutPlugin.status).toBe("failed");
  });
});
