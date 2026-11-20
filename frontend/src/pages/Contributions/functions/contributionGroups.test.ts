import { describe, expect, it } from "vitest";
import type { ContributionSummary } from "../../../objects/gallery/Contribution";
import {
  CONTRIBUTION_MAX_MEMORY_CODE_POINTS,
  CONTRIBUTION_MAX_SUGGESTED_CAPTION_CODE_POINTS,
  describeAdoptionDestination,
  describeContributionMedia,
  describeContributionStatus,
  describePhotoQuotaHint,
  groupContributionsByExhibition,
  isHistoricalTextOnly,
  isParticipantRevokedError,
  publicExhibitionPathOf,
  PHOTO_REQUIRED_FOR_SUBMIT_MESSAGE,
  validateContributionEditor,
  validateContributionPhoto,
  validatePhotoForSubmit,
  validateSuggestedCaption,
  WITHDRAW_CONTRIBUTION_CONFIRM_MESSAGE,
} from "./contributionGroups";
import { ApiError } from "../../../apis/shared/ApiError";

const contribution = (overrides: Partial<ContributionSummary> = {}): ContributionSummary => ({
  id: "c-1",
  exhibitionId: "ex-1",
  exhibitionTitle: "雨中的济州",
  contributor: { contributorId: "u-1", username: "island_walker", displayName: "海风" },
  status: "draft",
  version: 1,
  memoryText: "",
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

const adoption = {
  contributionId: "c-1",
  photoId: "p-1",
  memoryId: "m-1",
  adoptedVersion: 2,
};

describe("我参与的纯函数（回忆优先）", () => {
  it("按展览分组保持服务端顺序", () => {
    const groups = groupContributionsByExhibition([
      contribution({ id: "a", exhibitionId: "ex-1", exhibitionTitle: "A" }),
      contribution({ id: "b", exhibitionId: "ex-2", exhibitionTitle: "B" }),
      contribution({ id: "c", exhibitionId: "ex-1", exhibitionTitle: "A" }),
    ]);
    expect(groups.map((group) => group.exhibitionId)).toEqual(["ex-1", "ex-2"]);
    expect(groups[0]!.contributions.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("已采用回忆的去向：未采用无文案；展览未发布/发布在采用前/已公开/有待确认修改", () => {
    expect(describeAdoptionDestination(contribution({ status: "submitted" }))).toBeNull();
    const adopted = contribution({ status: "submitted", adoption });
    expect(describeAdoptionDestination(adopted)).toContain("展览还没有发布");
    expect(
      describeAdoptionDestination({ ...adopted, exhibitionPublished: true, memoryPublished: false }),
    ).toContain("展览发布在采用之前");
    expect(
      describeAdoptionDestination({ ...adopted, exhibitionPublished: true, memoryPublished: true }),
    ).toBe("已采用的这一版讲述已随展览公开。");
    const pending = describeAdoptionDestination({
      ...adopted,
      exhibitionPublished: true,
      memoryPublished: true,
      hasPendingUpdate: true,
    });
    expect(pending).toContain("已随展览公开");
    expect(pending).toContain("等待策展人确认");
  });

  it("公开展览路径：只有展览已发布才有", () => {
    expect(publicExhibitionPathOf(contribution({ exhibitionId: "ex-9" }))).toBeNull();
    expect(publicExhibitionPathOf(contribution({ exhibitionId: "ex-9", exhibitionPublished: true }))).toBe(
      "/show/ex-9",
    );
  });

  it("状态文案覆盖草稿/待审/已采用/修改待确认/未被采用/已撤回", () => {
    expect(describeContributionStatus(contribution({ status: "draft" }))).toBe("草稿");
    expect(describeContributionStatus(contribution({ status: "submitted" }))).toBe("待策展人查看");
    expect(
      describeContributionStatus(contribution({ status: "submitted", adoption })),
    ).toContain("已采用第 2 版");
    expect(
      describeContributionStatus(
        contribution({ status: "submitted", adoption, hasPendingUpdate: true }),
      ),
    ).toContain("修改待确认");
    expect(describeContributionStatus(contribution({ status: "declined" }))).toContain("未被采用");
    expect(describeContributionStatus(contribution({ status: "withdrawn" }))).toBe("已撤回");
  });

  it("未附图/含照片标识", () => {
    expect(describeContributionMedia(contribution())).toBe("草稿 · 未附图");
    expect(
      describeContributionMedia(
        contribution({
          file: {
            mime: "image/jpeg",
            width: 100,
            height: 100,
            contentUrl: "/c?variant=full",
            thumbUrl: "/c?variant=thumb",
          },
        }),
      ),
    ).toBe("含 1 张照片");
    expect(describePhotoQuotaHint()).toContain("必须附 1 张照片");
  });

  it("保存草稿允许空回忆；提交要求 1–1000 码点", () => {
    expect(validateContributionEditor("", false, "", "", "")).toEqual({
      ok: true,
      memoryText: "",
      location: null,
    });
    expect(validateContributionEditor("", true, "", "", "").ok).toBe(false);
    expect(
      validateContributionEditor("字".repeat(CONTRIBUTION_MAX_MEMORY_CODE_POINTS + 1), true, "", "", "")
        .ok,
    ).toBe(false);
    expect(
      validateContributionEditor("海风很大。", true, "", "", ""),
    ).toEqual({ ok: true, memoryText: "海风很大。", location: null });
  });

  it("位置可选但坐标必须成对合法", () => {
    expect(validateContributionEditor("海风很大。", true, "涯月邑", "", "")).toEqual({
      ok: true,
      memoryText: "海风很大。",
      location: { name: "涯月邑", latitude: null, longitude: null },
    });
    expect(validateContributionEditor("海风很大。", true, "涯月邑", "33.46", "").ok).toBe(false);
    expect(validateContributionEditor("海风很大。", true, "涯月邑", "99", "126.3").ok).toBe(false);
    expect(validateContributionEditor("海风很大。", true, "涯月邑", "33.46", "126.3")).toEqual({
      ok: true,
      memoryText: "海风很大。",
      location: { name: "涯月邑", latitude: 33.46, longitude: 126.3 },
    });
  });

  it("可选照片预检：格式与大小", () => {
    const jpeg = new File(["x"], "a.jpg", { type: "image/jpeg" });
    expect(validateContributionPhoto(jpeg).ok).toBe(true);
    const gif = new File(["x"], "a.gif", { type: "image/gif" });
    expect(validateContributionPhoto(gif).ok).toBe(false);
  });

  it("建议图注可选、≤120 码点，空串转 null", () => {
    expect(validateSuggestedCaption("  ")).toEqual({ ok: true, value: null });
    expect(validateSuggestedCaption("海风很大的一天")).toEqual({
      ok: true,
      value: "海风很大的一天",
    });
    expect(
      validateSuggestedCaption("字".repeat(CONTRIBUTION_MAX_SUGGESTED_CAPTION_CODE_POINTS)).ok,
    ).toBe(true);
    expect(
      validateSuggestedCaption("字".repeat(CONTRIBUTION_MAX_SUGGESTED_CAPTION_CODE_POINTS + 1))
        .ok,
    ).toBe(false);
    expect(validateSuggestedCaption("带\n换行").ok).toBe(false);
    expect(validateSuggestedCaption("带\t制表符").ok).toBe(false);
  });

  it("v1.12 照片必填：草稿可暂缺，提交前必须有一张", () => {
    expect(validatePhotoForSubmit(false, false, false)).toEqual({
      ok: false,
      message: PHOTO_REQUIRED_FOR_SUBMIT_MESSAGE,
    });
    expect(validatePhotoForSubmit(true, false, true).ok).toBe(false);
    expect(validatePhotoForSubmit(true, false, false).ok).toBe(true);
    expect(validatePhotoForSubmit(false, true, false).ok).toBe(true);
  });

  it("历史纯文字与未附图草稿用不同标识", () => {
    expect(describeContributionMedia(contribution({ status: "draft" }))).toBe("草稿 · 未附图");
    expect(describeContributionMedia(contribution({ status: "submitted" }))).toBe(
      "历史纯文字回忆",
    );
    expect(isHistoricalTextOnly(contribution({ status: "draft" }))).toBe(false);
    expect(isHistoricalTextOnly(contribution({ status: "submitted" }))).toBe(true);
  });

  it("撤回确认文案说明草稿清理、已发布不变与不可恢复", () => {
    expect(WITHDRAW_CONTRIBUTION_CONFIRM_MESSAGE).toContain("草稿");
    expect(WITHDRAW_CONTRIBUTION_CONFIRM_MESSAGE).toContain("已发布版本不会改变");
    expect(WITHDRAW_CONTRIBUTION_CONFIRM_MESSAGE).toContain("无法恢复");
  });

  it("识别参与被撤销错误", () => {
    expect(
      isParticipantRevokedError(
        new ApiError({
          status: 409,
          code: "CONFLICT",
          reason: "PARTICIPANT_REVOKED",
          message: "revoked",
        }),
      ),
    ).toBe(true);
    expect(isParticipantRevokedError(new Error("x"))).toBe(false);
  });
});
