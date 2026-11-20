import { describe, expect, it } from "vitest";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { PhotoView } from "../../../objects/gallery/PhotoView";
import type { CurationDraft } from "../objects/CurationDraft";
import {
  allGroupsExpanded,
  expandGroup,
  initialExpandedGroups,
  moveExpandedGroup,
  removeExpandedGroup,
  toggleExpandedGroup,
} from "./expandedGroups";
import { isCurationDraftDirty } from "./isCurationDraftDirty";
import { rebaseCurationDraft } from "./rebaseCurationDraft";
import { unassignedPhotos } from "./unassignedPhotos";

const photo = (id: string): PhotoView => ({
  id,
  originalName: `${id}.jpg`,
  mime: "image/jpeg",
  width: 800,
  height: 600,
  caption: "",
  groupId: null,
  positionInGroup: null,
  contentUrl: `/api/photos/${id}/content?variant=full`,
  thumbUrl: `/api/photos/${id}/content?variant=thumb`,
  memories: [],
});

const detailWith = (groupPhotos: readonly string[], ungrouped: readonly string[]): ExhibitionDetail => ({
  id: "ex-1",
  title: "济州岛的记忆",
  narrative: "",
  updatedAt: "2026-10-29T08:00:00Z",
  groups: [{ id: "g-1", title: "海边", narrative: "", position: 0, photos: groupPhotos.map(photo) }],
  ungroupedPhotos: ungrouped.map(photo),
  sceneRun: null,
  currentSceneRun: null,  sceneStale: true,
  cover: { kind: "auto", imageUrl: "", width: 0, height: 0 },
  publication: null,
  hasUnpublishedChanges: false,
  pendingContributionCount: 0,
  scenePalette: [],
  locations: [],
});

/** 用户改过标题与图注、尚未保存的草稿。 */
const editedDraft: CurationDraft = {
  title: "改过的标题",
  narrative: "",
  groups: [
    {
      title: "海边",
      narrative: "",
      photos: [
        { photoId: "p-1", caption: "新图注" },
        { photoId: "p-2", caption: "" },
      ],
    },
  ],
};

describe("刷新详情时保留未保存草稿", () => {
  it("上传新照片：草稿原样保留，新照片进入未分组", () => {
    const afterUpload = detailWith(["p-1", "p-2"], ["p-9"]);
    const rebased = rebaseCurationDraft(editedDraft, afterUpload);
    expect(rebased).toEqual(editedDraft);
    expect(unassignedPhotos(afterUpload, rebased).map((item) => item.id)).toEqual(["p-9"]);
    expect(isCurationDraftDirty(afterUpload, rebased)).toBe(true);
  });

  it("设置场景封面后刷新详情，未保存草稿及 dirty 状态保留", () => {
    const detail = detailWith(["p-1", "p-2"], []);
    const afterCover: ExhibitionDetail = { ...detail, updatedAt: "2026-10-29T09:00:00Z", cover: { kind: "render", imageUrl: "/api/exhibitions/ex-1/cover", width: 800, height: 600 } };
    const rebased = rebaseCurationDraft(editedDraft, afterCover);
    expect(rebased).toEqual(editedDraft);
    expect(isCurationDraftDirty(afterCover, rebased)).toBe(true);
  });

  it("删除照片：只剔除已不存在的照片，其余编辑不动", () => {
    const rebased = rebaseCurationDraft(editedDraft, detailWith(["p-1"], []));
    expect(rebased.title).toBe("改过的标题");
    expect(rebased.groups[0]?.photos).toEqual([{ photoId: "p-1", caption: "新图注" }]);
  });
});

describe("章节展开状态", () => {
  it("章节不多时全部展开，多时只展开第一章", () => {
    expect([...initialExpandedGroups(0)]).toEqual([]);
    expect([...initialExpandedGroups(2)]).toEqual([0, 1]);
    expect([...initialExpandedGroups(5)]).toEqual([0]);
    expect([...allGroupsExpanded(3)]).toEqual([0, 1, 2]);
  });

  it("切换 / 展开", () => {
    const expanded = toggleExpandedGroup(new Set([0]), 2);
    expect([...expanded].sort()).toEqual([0, 2]);
    expect([...toggleExpandedGroup(expanded, 0)]).toEqual([2]);
    expect([...expandGroup(expanded, 2)].sort()).toEqual([0, 2]);
  });

  it("章节移动时展开状态跟着章节走，越界不变", () => {
    expect([...moveExpandedGroup(new Set([1]), 1, "up", 3)]).toEqual([0]);
    expect([...moveExpandedGroup(new Set([0]), 1, "up", 3)]).toEqual([1]);
    expect([...moveExpandedGroup(new Set([2]), 2, "down", 3)]).toEqual([2]);
  });

  it("删除章节后其后下标前移", () => {
    expect([...removeExpandedGroup(new Set([0, 1, 3]), 1)].sort()).toEqual([0, 2]);
  });
});
