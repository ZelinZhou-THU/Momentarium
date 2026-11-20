import { describe, expect, it } from "vitest";
import type { ContributionSummary } from "../../../../../objects/gallery/Contribution";
import {
  collectAdoptedMemories,
  declinedContributions,
  defaultAdoptionGroupId,
  describeAdoptionGroup,
  describeMemoryTextChange,
  describeReviewStatus,
  findAdoptedSnapshot,
  otherContributions,
  pendingReviewContributions,
  REMOVE_MEMORY_CONFIRM_MESSAGE,
  validateAdoptionForm,
  withdrawnContributions,
} from "./contributionManagement";
import { createMapPanelDetail } from "../../MapPanel/mocks/mapPanelFixtures";

const contribution = (overrides: Partial<ContributionSummary> = {}): ContributionSummary => ({
  id: "c-1",
  exhibitionId: "ex-1",
  exhibitionTitle: "雨中的济州",
  contributor: { contributorId: "u-1", username: "island_walker", displayName: "海风" },
  status: "submitted",
  version: 1,
  memoryText: "那天的海风很大。",
  suggestedCaption: null,
  location: null,
  file: null,
  adoption: null,
  hasPendingUpdate: false,
  exhibitionPublished: false,
  memoryPublished: false,
  createdAt: "2026-11-03T02:00:00Z",
  updatedAt: "2026-11-03T02:05:00Z",
  withdrawnAt: null,
  ...overrides,
});

const adopted = { contributionId: "c", photoId: "p-1", memoryId: "m-1", adoptedVersion: 2 };

describe("工作台回忆审阅纯函数（回忆优先）", () => {
  it("分区：待审=submitted 未采用或有更新；未采用/已撤回/其他分开", () => {
    const items = [
      contribution({ id: "new" }),
      contribution({ id: "pending", adoption: adopted, hasPendingUpdate: true }),
      contribution({ id: "adopted", adoption: adopted }),
      contribution({ id: "declined", status: "declined" }),
      contribution({ id: "withdrawn", status: "withdrawn" }),
    ];
    expect(pendingReviewContributions(items).map((item) => item.id)).toEqual(["new", "pending"]);
    expect(declinedContributions(items).map((item) => item.id)).toEqual(["declined"]);
    expect(withdrawnContributions(items).map((item) => item.id)).toEqual(["withdrawn"]);
    expect(otherContributions(items).map((item) => item.id)).toEqual(["adopted"]);
    expect(describeReviewStatus(items[0]!)).toBe("待审");
    expect(describeReviewStatus(items[1]!)).toBe("待确认更新");
  });

  it("从草稿详情收集已采用讲述（v1.12 不再有已有照片选择器）", () => {
    const base = createMapPanelDetail();
    const detail = {
      ...base,
      groups: base.groups.map((group) => ({
        ...group,
        photos: group.photos.map((photo, index) =>
          index === 0
            ? {
                ...photo,
                memories: [{ memoryId: "m-1", text: "海风很大。", contributorName: "海风" }],
              }
            : photo,
        ),
      })),
    };
    const rows = collectAdoptedMemories(detail);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.memoryId).toBe("m-1");
    // 称呼统一回退（图注 → 原文件名），不再暴露照片 ID 片段。
    expect(rows[0]!.photoLabel).not.toMatch(/[0-9a-f]{8}/u);
    expect(rows[0]!.thumbUrl).toContain("thumb");
  });

  it("待确认更新：按 memoryId 找到已采用的讲述快照并描述文字变化；找不到时为 null", () => {
    const rows = [
      {
        photoId: "p-1",
        photoLabel: "退潮的礁石",
        caption: "退潮的礁石",
        location: null,
        thumbUrl: "/t",
        contentUrl: "/c",
        memoryId: "m-1",
        text: "第一版的讲述。",
        contributorName: "海风",
      },
    ];
    const pending = contribution({
      adoption: { contributionId: "c-1", photoId: "p-1", memoryId: "m-1", adoptedVersion: 1 },
      hasPendingUpdate: true,
      version: 2,
      memoryText: "第二版的讲述。",
    });
    expect(findAdoptedSnapshot(pending, rows)).toEqual({
      version: 1,
      text: "第一版的讲述。",
      photoLabel: "退潮的礁石",
      caption: "退潮的礁石",
      location: null,
      thumbUrl: "/t",
      contentUrl: "/c",
    });
    expect(findAdoptedSnapshot(contribution(), rows)).toBeNull();
    expect(findAdoptedSnapshot(pending, [])).toBeNull();
    expect(describeMemoryTextChange("第一版的讲述。", "第二版的讲述。")).toBe("讲述文字有修改");
    expect(describeMemoryTextChange(" 同一段 ", "同一段")).toContain("没有变化");
  });

  it("采用对话框默认章节：最后一章；没有章节为 null；空标题按序号称呼", () => {
    const groups = [
      { id: "g-1", title: "退潮" },
      { id: "g-2", title: "  " },
    ];
    expect(defaultAdoptionGroupId(groups)).toBe("g-2");
    expect(defaultAdoptionGroupId([])).toBeNull();
    expect(describeAdoptionGroup(groups[0]!, 0)).toBe("退潮");
    expect(describeAdoptionGroup(groups[1]!, 1)).toBe("章节 2");
  });

  it("采用表单（只剩收进草稿）：图注可空/清空，位置与公开粒度校验", () => {
    expect(validateAdoptionForm("", "", "", "", "hidden")).toEqual({
      ok: true,
      values: { caption: "", location: null },
    });
    expect(validateAdoptionForm("  图注  ", "", "", "", "hidden")).toEqual({
      ok: true,
      values: { caption: "图注", location: null },
    });
    expect(
      validateAdoptionForm("图注", "涯月邑", "33.46", "126.3", "area"),
    ).toEqual({
      ok: true,
      values: {
        caption: "图注",
        location: { name: "涯月邑", latitude: 33.46, longitude: 126.3, granularity: "area" },
      },
    });

    // 图注超 120 码点/含控制字符、坐标不成对、area 无坐标都拒绝。
    expect(validateAdoptionForm("字".repeat(121), "", "", "", "hidden").ok).toBe(false);
    expect(validateAdoptionForm("带\n换行", "", "", "", "hidden").ok).toBe(false);
    expect(validateAdoptionForm("图注", "涯月邑", "33.46", "", "area").ok).toBe(false);
    expect(validateAdoptionForm("图注", "涯月邑", "", "", "area").ok).toBe(false);
  });
});

describe("移除讲述二次确认文案", () => {
  it("说明可能一并清理草稿照片，但已发布版本不变", () => {
    expect(REMOVE_MEMORY_CONFIRM_MESSAGE).toContain("只会移除这段讲述");
    expect(REMOVE_MEMORY_CONFIRM_MESSAGE).toContain("一并从草稿移除或归档");
    expect(REMOVE_MEMORY_CONFIRM_MESSAGE).toContain("已发布版本不会改变");
  });
});
