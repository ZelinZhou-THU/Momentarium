import { describe, expect, it } from "vitest";
import type { PhotoLocationView } from "../../../objects/gallery/PhotoLocationView";
import { createPublicExhibitionFixture, createPublicPhotoFixture } from "../mocks/publicShowFixtures";
import {
  buildPublicMapLocations,
  buildPublicMapMarkers,
  describePublicMapStatus,
  projectPublicLocations,
} from "./publicLocations";

const location = (photoId: string, overrides: Partial<PhotoLocationView> = {}): PhotoLocationView => ({
  photoId,
  source: "manual",
  status: "confirmed",
  name: "济州岛 · 涉地可支",
  latitude: 33.4592,
  longitude: 126.936,
  granularity: "exact",
  ...overrides,
});

describe("公开位置投影（仅 confirmed 且非 hidden）", () => {
  it("按照片顺序投影；suggested、hidden、缺坐标都不进入公开投影", () => {
    const projected = projectPublicLocations(
      [
        location("p2", { name: "范围代表点", granularity: "area" }),
        location("p1"),
        location("p3", { status: "suggested" }),
        location("p4", { granularity: "hidden" }),
        location("p5", { latitude: null, longitude: null, granularity: "hidden" }),
      ],
      ["p1", "p2", "p3", "p4", "p5"],
    );
    expect(projected.map((item) => item.photoId)).toEqual(["p1", "p2"]);
    expect(projected[1]?.granularity).toBe("area");
    expect(projected.every((item) => item.latitude !== null)).toBe(true);
  });

  it("公开快照装配：关联快照照片、过滤缺失照片/重复/非法坐标，保持快照顺序", () => {
    const exhibition = createPublicExhibitionFixture();
    const rows = buildPublicMapLocations(exhibition);
    expect(rows.map((row) => row.photo.id)).toEqual(["photo-jeju-01", "photo-jeju-02"]);
    expect(rows[0]?.location.granularity).toBe("area");
    expect(rows[0]?.point).toEqual({ latitude: 33.4592, longitude: 126.936 });

    const withGhost = createPublicExhibitionFixture({
      locations: [
        {
          photoId: "photo-missing",
          name: "快照里没有这张照片",
          granularity: "exact",
          latitude: 33.1,
          longitude: 126.1,
        },
        {
          photoId: "photo-jeju-01",
          name: "重复位置",
          granularity: "exact",
          latitude: 33.4592,
          longitude: 126.936,
        },
      ],
    });
    // 快照里不存在的照片被过滤；同一 photoId 只保留第一条（顺序有契约意义）。
    expect(buildPublicMapLocations(withGhost).map((row) => row.location.name)).toEqual([
      "重复位置",
    ]);

    const invalidCoordinates = createPublicExhibitionFixture({
      locations: [
        {
          photoId: "photo-jeju-01",
          name: "非法坐标",
          granularity: "exact",
          latitude: 200,
          longitude: 126.9,
        },
      ],
    });
    expect(buildPublicMapLocations(invalidCoordinates)).toEqual([]);
  });

  it("没有公开位置（含旧快照空数组）时地图行正常为空，不是错误", () => {
    expect(buildPublicMapLocations(createPublicExhibitionFixture())).toHaveLength(2);
    expect(buildPublicMapLocations(createPublicExhibitionFixture({ locations: [] }))).toEqual([]);
  });

  it("公开地图标记：area 画范围、exact 画点，名称空时回退图注", () => {
    const rows = buildPublicMapLocations(
      createPublicExhibitionFixture({
        locations: [
          {
            photoId: "photo-jeju-01",
            name: "",
            granularity: "area",
            latitude: 33.4592,
            longitude: 126.936,
          },
        ],
        photos: [createPublicPhotoFixture("photo-jeju-01", "退潮后的黑色礁石")],
      }),
    );
    const markers = buildPublicMapMarkers(rows);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.shape).toBe("area");
    expect(markers[0]?.emphasis).toBe("confirmed");
    expect(markers[0]?.label).toBe("退潮后的黑色礁石");
  });

  it("地图状态提示覆盖加载失败与断网，不产生错误态页面", () => {
    expect(describePublicMapStatus("idle", true)).toBeNull();
    expect(describePublicMapStatus("ready", true)).toBeNull();
    expect(describePublicMapStatus("failed", true)).toContain("切回「章节」");
    expect(describePublicMapStatus("idle", false)).toContain("网络不可用");
    expect(describePublicMapStatus("failed", false)).toContain("网络不可用");
  });
});
