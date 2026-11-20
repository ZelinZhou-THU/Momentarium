import { describe, expect, it } from "vitest";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { ExhibitionPhotoInput } from "../../../objects/gallery/ExhibitionPhotoInput";
import type { ThemeProposal } from "../../../objects/curation/ThemeProposal";
import { buildCurationDraft } from "./buildCurationDraft";
import { draftGroupsFromGroupInputs } from "./draftGroupsFromGroupInputs";
import { draftGroupsFromThemeProposal } from "./draftGroupsFromThemeProposal";
import { draftToGroupInputs } from "./draftToGroupInputs";
import { isCurationDraftDirty } from "./isCurationDraftDirty";
import { unassignedPhotos } from "./unassignedPhotos";

const photo = (id: string, caption = "") => ({
  id,
  originalName: `${id}.jpg`,
  mime: "image/jpeg",
  width: 2048,
  height: 1365,
  caption,
  groupId: null,
  positionInGroup: null,
  contentUrl: `/api/photos/${id}/content?variant=full`,
  thumbUrl: `/api/photos/${id}/content?variant=thumb`,
  memories: [],
});

const detail: ExhibitionDetail = {
  id: "0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10",
  title: "济州岛的记忆",
  narrative: "",
  updatedAt: "2026-10-27T08:00:00Z",
  groups: [
    {
      id: "g-1",
      title: "抵达",
      narrative: "第一组。",
      position: 0,
      photos: [photo("p-1", "海岸"), photo("p-2", "")],
    },
  ],
  ungroupedPhotos: [photo("p-3", "街巷")],
  sceneRun: null,
  currentSceneRun: null,  sceneStale: true,
  cover: {
    kind: "auto",
    imageUrl: "/api/exhibitions/0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10/cover",
    width: 2048,
    height: 1365,
  },
  publication: null,
  hasUnpublishedChanges: false,
  pendingContributionCount: 0,
  scenePalette: [],
  locations: [],
};

describe("策展草稿纯函数", () => {
  it("由详情构建草稿，且初始不脏", () => {
    const draft = buildCurationDraft(detail);

    expect(draft.groups[0]?.photos.map((item) => item.photoId)).toEqual(["p-1", "p-2"]);
    expect(isCurationDraftDirty(detail, draft)).toBe(false);
  });

  it("图注/顺序/标题变化都会标记为有未保存修改", () => {
    const draft = buildCurationDraft(detail);

    expect(isCurationDraftDirty(detail, { ...draft, title: "新标题" })).toBe(true);
    expect(
      isCurationDraftDirty(detail, {
        ...draft,
        groups: draft.groups.map((group) => ({ ...group, narrative: "改过的叙事" })),
      }),
    ).toBe(true);
    expect(
      isCurationDraftDirty(detail, {
        ...draft,
        groups: draft.groups.map((group) => ({
          ...group,
          photos: [...group.photos].reverse(),
        })),
      }),
    ).toBe(true);
  });

  it("未分组托盘 = 全部照片中未放入任何章节的照片", () => {
    const draft = buildCurationDraft(detail);

    expect(unassignedPhotos(detail, draft).map((item) => item.id)).toEqual(["p-3"]);
    const allAssigned = {
      ...draft,
      groups: draft.groups.map((group) => ({
        ...group,
        photos: [...group.photos, { photoId: "p-3", caption: "街巷" }],
      })),
    };
    expect(unassignedPhotos(detail, allAssigned)).toHaveLength(0);
  });

  it("草稿序列化为 updatecuration 的 GroupInput[]", () => {
    const inputs = draftToGroupInputs(buildCurationDraft(detail));

    expect(inputs).toEqual([
      {
        title: "抵达",
        narrative: "第一组。",
        photos: [
          { photoId: "p-1", caption: "海岸" },
          { photoId: "p-2", caption: "" },
        ],
      },
    ]);
  });

  it("主题提案按 photoIds 转草稿并沿用已有图注", () => {
    const proposal: ThemeProposal = {
      name: "雨后的海岸",
      concept: "潮声与雾色。",
      groups: [{ title: "海边", photoIds: ["p-2", "p-3"] }],
    };

    const groups = draftGroupsFromThemeProposal(proposal, detail);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.photos).toEqual([
      { photoId: "p-2", caption: "" },
      { photoId: "p-3", caption: "街巷" },
    ]);
  });

  it("CurationProposal.groups 直接转草稿（保留图注）", () => {
    const photos: ExhibitionPhotoInput[] = [{ photoId: "p-1", caption: "雨中的海岸" }];
    const groups = draftGroupsFromGroupInputs([
      { title: "雨先落下", narrative: "第一组。", photos },
    ]);

    expect(groups[0]?.photos[0]?.caption).toBe("雨中的海岸");
  });
});
