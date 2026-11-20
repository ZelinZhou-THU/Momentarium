import { describe, expect, it } from "vitest";
import { DecodeError } from "../../apis/shared/decode";
import { parseCoverRenderUploadResponse } from "./CoverRenderUploadResponse";
import { parseExhibitionDetail } from "./ExhibitionDetail";
import { parseExhibitionSummary } from "./ExhibitionSummary";
import { parseMyExhibitionsResponse } from "./MyExhibitionsResponse";
import { parseUploadPhotosResponse } from "./UploadPhotosResponse";

// 按 docs/api-contract.md §2 手写的契约形状样例（qa 的 docs/contracts/gallery 落地后应保持一致）。
const photoFixture = {
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

const summaryFixture = {
  id: "0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10",
  title: "济州的风",
  photoCount: 8,
  updatedAt: "2026-10-27T08:00:00Z",
  cover: {
    kind: "auto",
    imageUrl: "/api/exhibitions/0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10/cover",
    width: 1600,
    height: 1067,
  },
  sceneStale: true,
  publication: null,
  hasUnpublishedChanges: false,
  pendingContributionCount: 0,
  scenePalette: ["#22313B", "#FFC27A"],
};

const detailFixture = {
  id: summaryFixture.id,
  title: summaryFixture.title,
  narrative: "",
  updatedAt: summaryFixture.updatedAt,
  groups: [
    {
      id: "8f0a5c2d-3e14-4a6b-9c7d-1e2f3a4b5c60",
      title: "抵达",
      narrative: "",
      position: 0,
      photos: [photoFixture],
    },
  ],
  ungroupedPhotos: [],
  sceneRun: null,
  sceneStale: true,
  cover: summaryFixture.cover,
  publication: { version: 2, publishedAt: "2026-10-27T09:30:00Z" },
  hasUnpublishedChanges: true,
  pendingContributionCount: 2,
  scenePalette: [],
  locations: [
    {
      photoId: photoFixture.id,
      source: "exif",
      status: "suggested",
      name: "",
      latitude: 33.4589,
      longitude: 126.9365,
      granularity: "hidden",
    },
  ],
};

describe("gallery 解码层", () => {
  it("解码 ExhibitionSummary 与 MyExhibitionsResponse（含 null 可选字段）", () => {
    const response = parseMyExhibitionsResponse({ exhibitions: [summaryFixture] });

    expect(response.exhibitions).toHaveLength(1);
    expect(response.exhibitions[0]?.title).toBe("济州的风");
    expect(response.exhibitions[0]?.publication).toBeNull();
    expect(response.exhibitions[0]?.cover.kind).toBe("auto");
    expect(response.exhibitions[0]?.scenePalette).toEqual(["#22313B", "#FFC27A"]);
  });

  it("解码 ExhibitionDetail（章节 / 未分组照片 / 可空场景运行）", () => {
    const detail = parseExhibitionDetail(detailFixture);

    expect(detail.groups).toHaveLength(1);
    expect(detail.groups[0]?.photos[0]?.groupId).toBeNull();
    expect(detail.sceneRun).toBeNull();
    expect(detail.publication?.version).toBe(2);
    expect(detail.hasUnpublishedChanges).toBe(true);
    expect(detail.pendingContributionCount).toBe(2);
  });

  it("可选字段缺失（而非 null）视为契约违约", () => {
    const broken = { ...summaryFixture } as Record<string, unknown>;
    delete broken.publication;

    expect(() => parseExhibitionSummary(broken)).toThrow(DecodeError);
  });

  it("封闭枚举出现未声明取值时报错", () => {
    const broken = { ...summaryFixture, cover: { ...summaryFixture.cover, kind: "magic" } };

    expect(() => parseExhibitionSummary(broken)).toThrow(DecodeError);
  });

  it("解码 upload 响应（photos + failures 各自独立）", () => {
    const upload = parseUploadPhotosResponse({
      photos: [photoFixture],
      failures: [{ fileName: "IMG_0001.heic", reason: "UPLOAD_UNSUPPORTED_TYPE" }],
    });

    expect(upload.photos[0]?.originalName).toBe("jeju-01.jpg");
    expect(upload.failures[0]?.reason).toBe("UPLOAD_UNSUPPORTED_TYPE");
  });
});

it("封面渲染键必须是裸 UUID", () => {
  const response = { renderKey: "11111111-1111-4111-8111-111111111111", width: 800, height: 600 };
  expect(parseCoverRenderUploadResponse(response).renderKey).toBe(response.renderKey);
  expect(() => parseCoverRenderUploadResponse({ ...response, renderKey: `render/${response.renderKey}/cover.jpg` })).toThrow(DecodeError);
});