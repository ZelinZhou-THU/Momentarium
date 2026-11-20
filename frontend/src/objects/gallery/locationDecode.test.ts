import { describe, expect, it } from "vitest";
import { DecodeError } from "../../apis/shared/decode";
import { parseExhibitionDetail } from "./ExhibitionDetail";
import { geoPointOrNull, isValidLatitude, isValidLongitude } from "./GeoPoint";
import { parsePhotoLocationView } from "./PhotoLocationView";
import { parsePlaceSearchResponse } from "./PlaceSearchResponse";
import { parsePublicExhibitionView } from "./PublicExhibitionView";
import { parsePublicPhotoLocation } from "./PublicPhotoLocation";

const photo = {
  id: "5d2b4a1e-4b7c-4d4e-9d55-8f7a2b6c1e20",
  originalName: "jeju-01.jpg",
  mime: "image/jpeg",
  width: 1600,
  height: 1067,
  caption: "",
  groupId: null,
  positionInGroup: null,
  contentUrl: "/api/photos/5d2b4a1e-4b7c-4d4e-9d55-8f7a2b6c1e20/content?variant=full",
  thumbUrl: "/api/photos/5d2b4a1e-4b7c-4d4e-9d55-8f7a2b6c1e20/content?variant=thumb",
};

const locationView = {
  photoId: photo.id,
  source: "manual",
  status: "confirmed",
  name: "济州岛 · 涉地可支",
  latitude: 33.4592,
  longitude: 126.936,
  granularity: "exact",
};

const publicPhoto = {
  id: photo.id,
  width: 1600,
  height: 1067,
  caption: "",
  contentUrl: photo.contentUrl,
  thumbUrl: photo.thumbUrl,
  reading: null,
};

const publicExhibition = {
  id: "ex-1",
  version: 2,
  title: "济州的风",
  narrative: "",
  narration: "",
  cover: { kind: "auto", imageUrl: "/api/exhibitions/ex-1/cover", width: 1600, height: 1067 },
  groups: [],
  photos: [publicPhoto],
  publishedAt: "2026-11-02T09:00:00Z",
  author: null,
  scenePalette: [],
  locations: [
    {
      photoId: photo.id,
      name: "济州岛 · 涉地可支",
      granularity: "area",
      latitude: 33.4592,
      longitude: 126.936,
    },
  ],
};

const detail = {
  id: "ex-1",
  title: "济州的风",
  narrative: "",
  updatedAt: "2026-11-02T09:00:00Z",
  groups: [{ id: "group-1", title: "抵达", narrative: "", position: 0, photos: [photo] }],
  ungroupedPhotos: [],
  sceneRun: null,
  sceneStale: false,
  cover: { kind: "auto", imageUrl: "/api/exhibitions/ex-1/cover", width: 1600, height: 1067 },
  publication: null,
  hasUnpublishedChanges: false,
  pendingContributionCount: 0,
  scenePalette: [],
  locations: [
    { ...locationView, status: "suggested", source: "exif", granularity: "hidden", latitude: 33.4589, longitude: 126.9365 },
    locationView,
    { ...locationView, photoId: "photo-3", name: "济州市", latitude: null, longitude: null, granularity: "hidden" },
  ],
};

describe("位置 DTO 解码（api-contract v1.7）", () => {
  it("解码作者位置视图：来源/状态/粒度枚举与可空坐标", () => {
    const suggested = parsePhotoLocationView(detail.locations[0]);
    expect(suggested.source).toBe("exif");
    expect(suggested.status).toBe("suggested");
    expect(suggested.granularity).toBe("hidden");

    const onlyName = parsePhotoLocationView(detail.locations[2]);
    expect(onlyName.latitude).toBeNull();
    expect(onlyName.longitude).toBeNull();
    expect(onlyName.granularity).toBe("hidden");
  });

  it("封闭枚举出现未声明取值时报错", () => {
    expect(() => parsePhotoLocationView({ ...locationView, source: "gps" })).toThrow(DecodeError);
    expect(() => parsePhotoLocationView({ ...locationView, status: "unknown" })).toThrow(DecodeError);
    expect(() => parsePhotoLocationView({ ...locationView, granularity: "city" })).toThrow(DecodeError);
  });

  it("公开位置只接受 area/exact（hidden 必须是契约违约，不能静默渲染）", () => {
    expect(parsePublicPhotoLocation(publicExhibition.locations[0]).granularity).toBe("area");
    expect(() =>
      parsePublicPhotoLocation({ ...publicExhibition.locations[0], granularity: "hidden" }),
    ).toThrow(DecodeError);
  });

  it("地点搜索：空数组是正常无结果；候选字段缺失报错", () => {
    expect(parsePlaceSearchResponse({ candidates: [] }).candidates).toEqual([]);
    const parsed = parsePlaceSearchResponse({
      candidates: [
        {
          name: "涉地可支",
          displayName: "涉地可支, 济州特别自治道, 韩国",
          latitude: 33.4592,
          longitude: 126.936,
        },
      ],
    });
    expect(parsed.candidates[0]?.displayName).toContain("济州");
    expect(() => parsePlaceSearchResponse({ candidates: [{ name: "x" }] })).toThrow(DecodeError);
    expect(() => parsePlaceSearchResponse({})).toThrow(DecodeError);
  });

  it("ExhibitionDetail 解析器接受 locations 数组（含 null 坐标与三种粒度）", () => {
    const parsed = parseExhibitionDetail(detail);
    expect(parsed.locations).toHaveLength(3);
    expect(parsed.locations.map((location) => location.granularity)).toEqual([
      "hidden",
      "exact",
      "hidden",
    ]);
    expect(() => parseExhibitionDetail({ ...detail, locations: undefined })).toThrow(DecodeError);
  });

  it("PublicExhibitionView 解析 locations；旧快照缺字段按空数组兼容", () => {
    expect(parsePublicExhibitionView(publicExhibition).locations).toHaveLength(1);

    const oldSnapshot: Record<string, unknown> = { ...publicExhibition };
    delete oldSnapshot.locations;
    const parsedOld = parsePublicExhibitionView(oldSnapshot);
    expect(parsedOld.locations).toEqual([]);

    expect(() =>
      parsePublicExhibitionView({
        ...publicExhibition,
        locations: [{ ...publicExhibition.locations[0], granularity: "suggested" }],
      }),
    ).toThrow(DecodeError);
  });
});

describe("WGS84 点值", () => {
  it("坐标必须成对、有限且在范围内", () => {
    expect(geoPointOrNull(33.4, 126.9)).toEqual({ latitude: 33.4, longitude: 126.9 });
    expect(geoPointOrNull(null, 126.9)).toBeNull();
    expect(geoPointOrNull(33.4, null)).toBeNull();
    expect(geoPointOrNull(Number.NaN, 126.9)).toBeNull();
    expect(geoPointOrNull(91, 126.9)).toBeNull();
    expect(geoPointOrNull(33.4, 181)).toBeNull();
  });

  it("范围判断可复用于数据装配与表单校验", () => {
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(90.1)).toBe(false);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(-180.01)).toBe(false);
  });
});
