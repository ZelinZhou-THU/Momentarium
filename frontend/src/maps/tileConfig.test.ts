import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_TILE_CONFIG, resolveMapTileConfig } from "./tileConfig";

describe("地图瓦片配置（计划 §3.1）", () => {
  it("默认使用 OSM Standard 栅格瓦片并带可见署名", () => {
    const config = resolveMapTileConfig({});
    expect(config).toEqual(DEFAULT_MAP_TILE_CONFIG);
    expect(config.tileUrl).toContain("openstreetmap.org");
    expect(config.attribution).toContain("OpenStreetMap");
  });

  it("环境变量可替换瓦片地址与署名（去首尾空白）", () => {
    const config = resolveMapTileConfig({
      VITE_MAP_TILE_URL: "  https://tiles.example.test/{z}/{x}/{y}.png  ",
      VITE_MAP_TILE_ATTRIBUTION: " © Example ",
      VITE_MAP_TILE_MIN_ZOOM: "3",
      VITE_MAP_TILE_MAX_ZOOM: "16",
    });
    expect(config.tileUrl).toBe("https://tiles.example.test/{z}/{x}/{y}.png");
    expect(config.attribution).toBe("© Example");
    expect(config.minZoom).toBe(3);
    expect(config.maxZoom).toBe(16);
  });

  it("空值与非法缩放回退默认，且 maxZoom 不小于 minZoom", () => {
    const config = resolveMapTileConfig({
      VITE_MAP_TILE_URL: "   ",
      VITE_MAP_TILE_MIN_ZOOM: "not-a-number",
      VITE_MAP_TILE_MAX_ZOOM: "0",
    });
    expect(config.tileUrl).toBe(DEFAULT_MAP_TILE_CONFIG.tileUrl);
    expect(config.minZoom).toBe(DEFAULT_MAP_TILE_CONFIG.minZoom);
    expect(config.maxZoom).toBe(config.minZoom);
  });
});
