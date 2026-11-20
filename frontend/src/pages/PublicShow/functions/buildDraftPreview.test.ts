import { describe, expect, it } from "vitest";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { PhotoView } from "../../../objects/gallery/PhotoView";
import { createSceneBriefFixture, createSceneRunFixture } from "../../../scene/mocks/sceneRunFixtures";
import {
  buildDraftPreviewExhibition,
  checkDraftPreview,
  draftPreviewPresentation,
  publicShowPresentation,
} from "./buildDraftPreview";

const photo = (id: string): PhotoView => ({
  id,
  originalName: `${id}.jpg`,
  mime: "image/jpeg",
  width: 800,
  height: 600,
  caption: `${id} 的图注`,
  groupId: null,
  positionInGroup: null,
  contentUrl: `/api/photos/${id}/content?variant=full`,
  thumbUrl: `/api/photos/${id}/content?variant=thumb`,
  memories: [],
});

const succeededRun = createSceneRunFixture({
  status: "succeeded",
  code: "export function build(ctx) {}",
  photoIds: ["p2", "p1"],
  brief: createSceneBriefFixture({ entranceNarration: "走进退潮后的海岸。" }),
});

const detail = (overrides: Partial<ExhibitionDetail> = {}): ExhibitionDetail => ({
  id: "ex-1",
  title: "潮汐留下的句子",
  narrative: "一段缓慢的海边记忆。",
  updatedAt: "2026-10-29T08:00:00Z",
  groups: [{ id: "g1", title: "从海开始", narrative: "", position: 0, photos: [photo("p1"), photo("p2")] }],
  ungroupedPhotos: [],
  sceneRun: succeededRun,
  currentSceneRun:
    overrides.currentSceneRun ??
    (overrides.sceneRun === undefined ? succeededRun : overrides.sceneRun),
  sceneStale: false,
  cover: { kind: "auto", imageUrl: "/api/exhibitions/ex-1/cover", width: 800, height: 600 },
  publication: null,
  hasUnpublishedChanges: false,
  pendingContributionCount: 0,
  scenePalette: [],
  locations: [],
  ...overrides,
});

describe("作者看展预览", () => {
  it("只有通过评审、有代码、照片都还在的场景才能预览", () => {
    expect(checkDraftPreview(detail()).kind).toBe("ok");
    expect(checkDraftPreview(detail({ sceneRun: null }))).toMatchObject({ kind: "unavailable" });
    expect(
      checkDraftPreview(detail({ sceneRun: createSceneRunFixture({ status: "generating" }) })).kind,
    ).toBe("unavailable");
    const missingPhoto = detail({
      groups: [{ id: "g1", title: "从海开始", narrative: "", position: 0, photos: [photo("p1")] }],
    });
    expect(checkDraftPreview(missingPhoto)).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("删除") });
  });

  it("转成看展视图：章节按草稿，photos 按场景快照顺序，图片用本地地址", () => {
    const urls = new Map([
      ["p1", "blob:p1"],
      ["p2", "blob:p2"],
    ]);
    const view = buildDraftPreviewExhibition({
      detail: detail(),
      run: succeededRun,
      imageUrls: urls,
      coverUrl: "blob:cover",
      analyses: [],
    });
    expect(view.photos.map((item) => item.id)).toEqual(["p2", "p1"]);
    expect(view.groups[0]?.photos[0]).toMatchObject({ id: "p1", contentUrl: "blob:p1", thumbUrl: "blob:p1" });
    expect(view.cover.imageUrl).toBe("blob:cover");
    expect(view.narration).toBe("走进退潮后的海岸。");
  });

  it("照片解读取自分析缓存（没有缓存的为 null），场景主色取草稿详情", () => {
    const analysis = {
      description: "黄昏的海",
      mood: "怀念",
      palette: ["#1B2A4A", "#F2A65A"],
      memoryCues: ["潮声"],
      sensory: "咸湿的风",
      suggestedCaption: "浪把黄昏揉碎在黑石上",
    };
    const view = buildDraftPreviewExhibition({
      detail: detail({ scenePalette: ["#0B1020", "#F2A65A"] }),
      run: succeededRun,
      imageUrls: new Map(),
      coverUrl: "",
      analyses: [{ photoId: "p1", analysis, model: "fake-vision", analyzedAt: "2026-10-29T08:00:00Z" }],
    });
    expect(view.groups[0]?.photos.map((item) => item.reading)).toEqual([
      { palette: ["#1B2A4A", "#F2A65A"], poeticLine: "浪把黄昏揉碎在黑石上", sensory: "咸湿的风" },
      null,
    ]);
    expect(view.scenePalette).toEqual(["#0B1020", "#F2A65A"]);
  });

  it("草稿预览的公开位置只含 confirmed 且非 hidden，并按场景照片顺序", () => {
    const location = (
      photoId: string,
      overrides: Partial<import("../../../objects/gallery/PhotoLocationView").PhotoLocationView> = {},
    ) => ({
      photoId,
      source: "manual" as const,
      status: "confirmed" as const,
      name: "济州岛",
      latitude: 33.4592,
      longitude: 126.936,
      granularity: "exact" as const,
      ...overrides,
    });
    const view = buildDraftPreviewExhibition({
      // 场景快照顺序是 p2 → p1；p2 是未确认建议、额外照片 p3 是 hidden，都不进公开投影。
      detail: detail({
        locations: [
          location("p1"),
          location("p2", { status: "suggested" }),
          location("p3", { granularity: "hidden" }),
        ],
      }),
      run: succeededRun,
      imageUrls: new Map(),
      coverUrl: "",
      analyses: [],
    });
    expect(view.locations.map((item) => item.photoId)).toEqual(["p1"]);
    expect(view.locations[0]?.granularity).toBe("exact");
  });

  it("外框文案区分公开与预览，并说明与已发布版本的关系", () => {
    expect(draftPreviewPresentation(detail()).versionLabel).toBe("草稿预览 · 尚未发布");
    expect(
      draftPreviewPresentation(
        detail({ publication: { version: 2, publishedAt: "2026-10-28T10:00:00Z" }, hasUnpublishedChanges: true }),
      ).versionLabel,
    ).toBe("草稿预览 · 含第 2 版之后未发布的修改");
    expect(draftPreviewPresentation(detail({ sceneStale: true })).notice).toContain("较早的策展内容");
    expect(draftPreviewPresentation(detail()).backLink).toEqual({ label: "← 返回工作台", to: "/exhibitions/ex-1" });

    const publicView = buildDraftPreviewExhibition({
      detail: detail(),
      run: succeededRun,
      imageUrls: new Map(),
      coverUrl: "",
      analyses: [],
    });
    expect(publicShowPresentation({ ...publicView, version: 3 })).toMatchObject({ sceneBadge: "第 3 版", backLink: null });
  });
});

describe("草稿预览的当前场景与候选（v1.14）", () => {
  it("当前场景读 currentSceneRun，候选预览显式传候选运行", () => {
    const current = createSceneRunFixture({
      runId: "current-run",
      status: "succeeded",
      code: "current scene code",
      photoIds: ["p1", "p2"],
      isCurrent: true,
    });
    const candidate = createSceneRunFixture({
      runId: "candidate-run",
      status: "succeeded",
      kind: "revise",
      parentRunId: "current-run",
      code: "candidate scene code",
      photoIds: ["p2", "p1"],
      isCurrent: false,
    });
    const draft = detail({ sceneRun: candidate, currentSceneRun: current });
    expect(checkDraftPreview(draft)).toMatchObject({ kind: "ok", run: current });

    const candidateView = buildDraftPreviewExhibition({
      detail: { ...draft, scenePalette: ["#111111"] },
      run: candidate,
      imageUrls: new Map<string, string>(),
      coverUrl: "",
      analyses: [],
    });
    expect(candidateView.photos.map((photo) => photo.id)).toEqual(["p2", "p1"]);
  });
});
