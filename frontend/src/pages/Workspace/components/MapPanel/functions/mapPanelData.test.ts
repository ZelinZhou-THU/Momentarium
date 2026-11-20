import { describe, expect, it } from "vitest";
import { describePlaceSearchError } from "../../../../../apis/gallery/describePlaceSearchError";
import { ApiError } from "../../../../../apis/shared/ApiError";
import { buildLocationMarkers, selectedMarkerIdOf } from "./buildLocationMarkers";
import {
  buildLocationRows,
  countLocatedRows,
  defaultSelectedPhotoId,
  rowsWithPoints,
} from "./buildLocationRows";
import {
  describeLocationStatus,
  describeLocationSummary,
  describeMapFallbackHint,
} from "./describeLocation";
import {
  applyMapPoint,
  applyPlaceCandidate,
  createLocationDraft,
  validateLocationDraft,
} from "./locationDraft";
import {
  createMapPanelDetail,
  createPhotoFixture,
  createPhotoLocationFixture,
} from "../mocks/mapPanelFixtures";

const orderedDetail = (): ReturnType<typeof createMapPanelDetail> =>
  createMapPanelDetail({
    groups: [
      {
        id: "group-late",
        title: "后一章",
        narrative: "",
        position: 1,
        photos: [createPhotoFixture("photo-b", "B", 0), createPhotoFixture("photo-a", "A", 1)],
      },
      {
        id: "group-first",
        title: "前一章",
        narrative: "",
        position: 0,
        photos: [createPhotoFixture("photo-c", "C", 0)],
      },
    ],
    ungroupedPhotos: [createPhotoFixture("photo-d", "D")],
    locations: [
      createPhotoLocationFixture("photo-a", { name: "涉地可支" }),
      createPhotoLocationFixture("photo-b", {
        source: "exif",
        status: "suggested",
        name: "",
        latitude: null,
        longitude: null,
        granularity: "hidden",
      }),
      createPhotoLocationFixture("photo-d", {
        name: "济州市",
        latitude: 33.4996,
        longitude: 126.5312,
        granularity: "area",
      }),
    ],
  });

describe("地图分区数据装配", () => {
  it("照片按章节 position → 组内 positionInGroup → 未分组排序，并按 photoId 关联位置", () => {
    const rows = buildLocationRows(orderedDetail());
    expect(rows.map((row) => row.photoId)).toEqual(["photo-c", "photo-b", "photo-a", "photo-d"]);
    expect(rows.find((row) => row.photoId === "photo-c")?.location).toBeNull();
    expect(rows.find((row) => row.photoId === "photo-a")?.point).toEqual({
      latitude: 33.4592,
      longitude: 126.936,
    });
    expect(rows.find((row) => row.photoId === "photo-b")?.point).toBeNull();
    expect(countLocatedRows(rows)).toBe(3);
    expect(rowsWithPoints(rows).map((row) => row.photoId)).toEqual(["photo-a", "photo-d"]);
    // photo-b 虽然有“待确认建议”但没有坐标：默认仍选到第一张已有位置记录的照片。
    expect(defaultSelectedPhotoId(rows)).toBe("photo-b");
    expect(defaultSelectedPhotoId(buildLocationRows(createMapPanelDetail({ locations: [] })))).toBe(
      "photo-1",
    );
  });

  it("标记只包含合法坐标；area 画范围、suggested 弱化、空名称回退图注", () => {
    const markers = buildLocationMarkers(buildLocationRows(orderedDetail()));
    expect(markers.map((marker) => marker.id)).toEqual(["photo-a", "photo-d"]);
    const area = markers.find((marker) => marker.id === "photo-d");
    expect(area?.shape).toBe("area");
    expect(area?.emphasis).toBe("confirmed");
    expect(area?.label).toBe("济州市");

    const rowsWithSuggested = buildLocationRows(
      createMapPanelDetail({
        locations: [
          createPhotoLocationFixture("photo-2", {
            source: "exif",
            status: "suggested",
            name: "",
            granularity: "hidden",
          }),
        ],
      }),
    );
    const suggested = buildLocationMarkers(rowsWithSuggested).find(
      (marker) => marker.id === "photo-2",
    );
    expect(suggested?.emphasis).toBe("suggested");
    expect(suggested?.label).toBe("黄昏时分的海面");
  });

  it("选中标记只在选中行有坐标时突出", () => {
    const rows = buildLocationRows(orderedDetail());
    expect(selectedMarkerIdOf(null)).toBeNull();
    expect(selectedMarkerIdOf(rows.find((row) => row.photoId === "photo-c") ?? null)).toBeNull();
    expect(selectedMarkerIdOf(rows.find((row) => row.photoId === "photo-a") ?? null)).toBe(
      "photo-a",
    );
  });
});

describe("位置编辑草稿与校验（与契约 reason 对齐）", () => {
  it("由已有位置生成草稿；无坐标时两个输入为空", () => {
    expect(createLocationDraft("photo-1", null)).toEqual({
      photoId: "photo-1",
      name: "",
      latitude: "",
      longitude: "",
      granularity: "hidden",
    });
    const draft = createLocationDraft(
      "photo-1",
      createPhotoLocationFixture("photo-1", { latitude: null, longitude: null, granularity: "hidden" }),
    );
    expect(draft.latitude).toBe("");
    expect(draft.longitude).toBe("");
    expect(draft.granularity).toBe("hidden");
  });

  it("搜索候选与地图落点只改对应字段", () => {
    const base = createLocationDraft("photo-1", null);
    const withCandidate = applyPlaceCandidate(base, {
      name: "涉地可支",
      displayName: "涉地可支, 济州特别自治道, 韩国",
      latitude: 33.4592,
      longitude: 126.936,
    });
    expect(withCandidate.name).toBe("涉地可支");
    expect(withCandidate.latitude).toBe("33.4592");
    expect(withCandidate.granularity).toBe("hidden");

    const withPoint = applyMapPoint(base, { latitude: 33.4589, longitude: 126.9365 });
    expect(withPoint.latitude).toBe("33.458900");
    expect(withPoint.longitude).toBe("126.936500");
    expect(withPoint.name).toBe("");
  });

  it("名称 1–120 码点、坐标成对且在范围内、area/exact 必须有坐标", () => {
    const hidden = createLocationDraft("photo-1", null);
    expect(validateLocationDraft({ ...hidden, name: "济州岛" }).ok).toBe(true);

    const missingName = validateLocationDraft({ ...hidden, name: "   " });
    expect(missingName.ok).toBe(false);
    if (!missingName.ok) {
      expect(missingName.errors.name).toContain("请填写地点名称");
    }

    const tooLong = validateLocationDraft({ ...hidden, name: "记".repeat(121) });
    expect(tooLong.ok).toBe(false);

    const areaWithoutCoordinates = validateLocationDraft({
      ...hidden,
      name: "济州市",
      granularity: "area",
    });
    expect(areaWithoutCoordinates.ok).toBe(false);
    if (!areaWithoutCoordinates.ok) {
      expect(areaWithoutCoordinates.errors.granularity).toContain("必须有坐标");
    }

    const loneCoordinate = validateLocationDraft({
      ...hidden,
      name: "济州市",
      latitude: "33.4",
    });
    expect(loneCoordinate.ok).toBe(false);
    if (!loneCoordinate.ok) {
      expect(loneCoordinate.errors.coordinates).toContain("成对");
    }

    const outOfRange = validateLocationDraft({
      ...hidden,
      name: "济州市",
      latitude: "91",
      longitude: "126.9",
      granularity: "exact",
    });
    expect(outOfRange.ok).toBe(false);
    if (!outOfRange.ok) {
      expect(outOfRange.errors.coordinates).toContain("纬度无效");
    }

    const exact = validateLocationDraft({
      ...hidden,
      name: " 济州岛 · 涉地可支 ",
      latitude: "33.4592",
      longitude: "126.936",
      granularity: "exact",
    });
    expect(exact.ok).toBe(true);
    if (exact.ok) {
      expect(exact.name).toBe("济州岛 · 涉地可支");
      expect(exact.point).toEqual({ latitude: 33.4592, longitude: 126.936 });
    }
  });

  it("状态与摘要文案覆盖 unknown/建议/三种公开粒度", () => {
    expect(describeLocationStatus(null)).toBe("未定位");
    expect(
      describeLocationStatus(
        createPhotoLocationFixture("photo-1", { status: "suggested", source: "exif" }),
      ),
    ).toBe("推测位置 · 待确认（EXIF 建议）");
    expect(describeLocationStatus(createPhotoLocationFixture("photo-1", { granularity: "hidden" }))).toBe(
      "已确认 · 不公开",
    );
    expect(describeLocationStatus(createPhotoLocationFixture("photo-1", { granularity: "area" }))).toBe(
      "已确认 · 公开范围",
    );
    expect(describeLocationSummary(null)).toBe("还没有位置");
    expect(describeLocationSummary(createPhotoLocationFixture("photo-1", { name: "" }))).toContain(
      "33.45920",
    );
  });
});

describe("离线/瓦片不可用降级（不阻断列表与编辑）", () => {
  it("地图未开启、加载失败、断网时给出明确提示；就绪且在线不提示", () => {
    expect(describeMapFallbackHint("loading", true)).toBeNull();
    expect(describeMapFallbackHint("closed", true)?.message).toContain("在线地图是可选项");
    expect(describeMapFallbackHint("closed", false)?.message).toContain("仍可在列表中查看和编辑");
    expect(describeMapFallbackHint("ready", true)).toBeNull();
    expect(describeMapFallbackHint("ready", false)?.tone).toBe("warning");
    const failedOnline = describeMapFallbackHint("failed", true);
    expect(failedOnline?.message).toContain("退回位置列表与编辑");
    const failedOffline = describeMapFallbackHint("failed", false);
    expect(failedOffline?.message).toContain("位置列表与编辑不受影响");
  });

  it("搜索失败按 reason 码给文案（不是匹配后端 message）", () => {
    const upstream = new ApiError({
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
      reason: "PLACE_SEARCH_UNAVAILABLE",
      message: "backend text",
    });
    expect(describePlaceSearchError(upstream)).toContain("地点搜索服务暂时不可用");

    const invalidQuery = new ApiError({
      status: 400,
      code: "VALIDATION",
      reason: "PLACE_QUERY_INVALID",
      message: "backend text",
    });
    expect(describePlaceSearchError(invalidQuery)).toContain("地点名称");
  });
});

describe("服务端刷新后地图/位置列表不残留已删除照片", () => {
  it("重新拉取的详情里没有该照片时，位置行也不再包含它", () => {
    const detail = createMapPanelDetail({
      locations: [
        createPhotoLocationFixture("photo-1"),
        createPhotoLocationFixture("photo-2"),
      ],
    });
    expect(buildLocationRows(detail).some((row) => row.photoId === "photo-1")).toBe(true);

    // 模拟 remove memory 后端清理照片后，前端以服务端刷新结果为准重新拉取的详情。
    const refreshed = createMapPanelDetail({
      groups: detail.groups.map((group) => ({
        ...group,
        photos: group.photos.filter((photo) => photo.id !== "photo-1"),
      })),
      ungroupedPhotos: detail.ungroupedPhotos.filter((photo) => photo.id !== "photo-1"),
      locations: detail.locations.filter((location) => location.photoId !== "photo-1"),
    });
    const rows = buildLocationRows(refreshed);
    expect(rows.some((row) => row.photoId === "photo-1")).toBe(false);
    expect(rows.every((row) => row.photoId !== "photo-1")).toBe(true);
  });
});

describe("AI 候选只出现在编辑器，不进入地图/位置行", () => {
  it("未确认候选不生成坐标行与 marker；确认后由服务端详情中的 location 生成", () => {
    const unconfirmed = createMapPanelDetail({ locations: [] });
    const unconfirmedRows = buildLocationRows(unconfirmed);
    expect(unconfirmedRows.every((row) => row.point === null)).toBe(true);
    expect(buildLocationMarkers(unconfirmedRows)).toEqual([]);

    // 确认后服务端刷新 getexhibition，位置进入 detail.locations，地图才出现 marker。
    const confirmed = createMapPanelDetail({
      locations: [createPhotoLocationFixture("photo-1")],
    });
    const confirmedRows = buildLocationRows(confirmed);
    expect(confirmedRows.find((row) => row.photoId === "photo-1")?.point).not.toBeNull();
    expect(buildLocationMarkers(confirmedRows).some((marker) => marker.id === "photo-1")).toBe(
      true,
    );
  });
});
