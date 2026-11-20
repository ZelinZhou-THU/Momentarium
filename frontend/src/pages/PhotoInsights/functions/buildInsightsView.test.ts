import { describe, expect, it } from "vitest";
import type { PhotoAnalysis, PhotoInsightsResponse } from "../../../objects/curation/PhotoInsightsResponse";
import type { GroupView } from "../../../objects/gallery/GroupView";
import type { PhotoView } from "../../../objects/gallery/PhotoView";
import { buildInsightsView } from "./buildInsightsView";

const photo = (id: string, groupId: string | null): PhotoView => ({
  id,
  originalName: `${id}.jpg`,
  mime: "image/jpeg",
  width: 1024,
  height: 683,
  caption: "",
  groupId,
  positionInGroup: groupId === null ? null : 0,
  contentUrl: `/api/photos/${id}/content?variant=full`,
  thumbUrl: `/api/photos/${id}/content?variant=thumb`,
  memories: [],
});

const groups: GroupView[] = [
  { id: "g2", title: "雨后", narrative: "", position: 1, photos: [photo("p3", "g2")] },
  { id: "g1", title: "雨前", narrative: "", position: 0, photos: [photo("p1", "g1"), photo("p2", "g1")] },
];
const detail = { title: "雨街", groups, ungroupedPhotos: [photo("p4", null)] };

const analysis = (mood: string, palette: string[], memoryCues: string[]): PhotoAnalysis => ({
  description: "",
  mood,
  palette,
  memoryCues,
  sensory: "",
  suggestedCaption: "",
});

const insights: PhotoInsightsResponse = {
  analyses: [
    { photoId: "p1", analysis: analysis("安静", ["#223344", "#c8a26b"], ["雨声", "旧窗框"]), model: "m", analyzedAt: "2026-10-31T08:00:00Z" },
    { photoId: "p3", analysis: analysis("安静", ["#223344"], ["雨声"]), model: "m", analyzedAt: "2026-10-31T08:00:00Z" },
    { photoId: "p4", analysis: analysis("怀念", ["#AA8866"], ["站台"]), model: "m", analyzedAt: "2026-10-31T08:00:00Z" },
  ],
  latestBrief: null,
};

describe("buildInsightsView", () => {
  const view = buildInsightsView(detail, insights);

  it("按章节位置排列照片，未分组放最后，未分析的照片 analysis 为 null", () => {
    expect(view.chapters.map((chapter) => chapter.title)).toEqual(["雨前", "雨后", null]);
    expect(view.chapters.map((chapter) => chapter.key)).toEqual(["g1", "g2", "__ungrouped"]);
    expect(view.chapters[0]?.photos.map((item) => [item.photo.id, item.analysis === null])).toEqual([
      ["p1", false],
      ["p2", true],
    ]);
  });

  it("计数：已分析 3 / 共 4", () => {
    expect(view.analyzedCount).toBe(3);
    expect(view.totalCount).toBe(4);
  });

  it("情绪去重并保持首次出现顺序", () => {
    expect(view.moods).toEqual(["安静", "怀念"]);
  });

  it("色板统一大写后按出现次数降序、同次数按首次出现顺序", () => {
    expect(view.palette).toEqual(["#223344", "#C8A26B", "#AA8866"]);
  });

  it("记忆线索按次数降序计数", () => {
    expect(view.cues).toEqual([
      { cue: "雨声", count: 2 },
      { cue: "旧窗框", count: 1 },
      { cue: "站台", count: 1 },
    ]);
  });

  it("没有未分组照片时不产生空章节", () => {
    const withoutLoose = buildInsightsView({ ...detail, ungroupedPhotos: [] }, insights);
    expect(withoutLoose.chapters.map((chapter) => chapter.key)).toEqual(["g1", "g2"]);
  });
});
