import { describe, expect, it } from "vitest";
import { parsePhotoView } from "./PhotoView";
import { parsePublicPhotoView } from "./PublicExhibitionView";
import {
  parseContributionsResponse,
  parseContributionSummary,
  parseContributorBrief,
} from "./Contribution";
import { parseContributionUploadResponse } from "./ContributionUpload";
import {
  parseContributionInviteCreated,
  parseContributionInvitePreview,
  parseContributionInviteSummary,
  parseContributionMembershipView,
} from "./ContributionInvite";
import { parseContributionManagementResponse } from "./ContributionManagement";

const contributorBrief = {
  contributorId: "c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b",
  username: "island_walker",
  displayName: "海风",
};

const contributionJson = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f",
  exhibitionId: "0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10",
  exhibitionTitle: "雨中的济州",
  contributor: contributorBrief,
  status: "submitted",
  version: 1,
  memoryText: "那天的海风很大，我们把伞收起来走了很久。",
  location: {
    name: "济州岛 · 涯月邑",
    latitude: 33.4632,
    longitude: 126.3175,
    source: "manual",
  },
  file: {
    mime: "image/jpeg",
    width: 2048,
    height: 1365,
    contentUrl: "/api/contributions/5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f/content?variant=full",
    thumbUrl: "/api/contributions/5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f/content?variant=thumb",
  },
  adoption: null,
  hasPendingUpdate: false,
  exhibitionPublished: false,
  memoryPublished: false,
  createdAt: "2026-11-03T02:00:00Z",
  updatedAt: "2026-11-03T02:05:00Z",
  withdrawnAt: null,
  ...overrides,
});

const photoJson = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "photo-1",
  originalName: "a.jpg",
  mime: "image/jpeg",
  width: 1600,
  height: 1067,
  caption: "退潮后的礁石",
  groupId: null,
  positionInGroup: null,
  contentUrl: "/api/photos/photo-1/content?variant=full",
  thumbUrl: "/api/photos/photo-1/content?variant=thumb",
  ...overrides,
});

const publicPhotoJson = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "photo-1",
  width: 1600,
  height: 1067,
  caption: "退潮后的礁石",
  contentUrl: "/api/photos/photo-1/content?variant=full",
  thumbUrl: "/api/photos/photo-1/content?variant=thumb",
  reading: null,
  ...overrides,
});

describe("阶段 2 投稿 DTO 解码", () => {
  it("ContributionSummary/ContributionsResponse 严格解码，adoption 与 location 可为 null", () => {
    const parsed = parseContributionsResponse({ contributions: [contributionJson()] });
    expect(parsed.contributions).toHaveLength(1);
    expect(parsed.contributions[0]!.contributor).toEqual(contributorBrief);
    expect(parsed.contributions[0]!.location?.source).toBe("manual");
    expect(parsed.contributions[0]!.adoption).toBeNull();
    expect(parsed.contributions[0]!.file!.thumbUrl).toContain("variant=thumb");

    const adopted = parseContributionSummary(
      contributionJson({
        adoption: {
          contributionId: "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f",
          photoId: "9a1b2c3d-4e5f-4a6b-8c7d-1e2f3a4b5c6d",
          memoryId: "8f9a0b1c-2d3e-4f5a-9b6c-7d8e9f0a1b2c",
          adoptedVersion: 1,
        },
        hasPendingUpdate: true,
      }),
    );
    expect(adopted.adoption?.memoryId).toBe("8f9a0b1c-2d3e-4f5a-9b6c-7d8e9f0a1b2c");
    expect(adopted.hasPendingUpdate).toBe(true);
  });

  it("v1.16：展览已发布与回忆已公开可解码；缺字段不兼容（严格契约）", () => {
    const live = parseContributionSummary(contributionJson({ exhibitionPublished: true, memoryPublished: true }));
    expect(live.exhibitionPublished).toBe(true);
    expect(live.memoryPublished).toBe(true);
    const { memoryPublished: _omitted, ...withoutField } = contributionJson();
    expect(() => parseContributionSummary(withoutField)).toThrow();
  });

  it("v1.10：纯文字回忆 file=null，status=declined 可解码", () => {
    const textOnly = parseContributionSummary(
      contributionJson({ file: null, status: "declined", memoryText: "只写文字的回忆。" }),
    );
    expect(textOnly.file).toBeNull();
    expect(textOnly.status).toBe("declined");
    expect(textOnly.memoryText).toBe("只写文字的回忆。");
  });

  it("v1.11：建议图注 suggestedCaption 可空，缺字段兼容 null", () => {
    expect(parseContributionSummary(contributionJson()).suggestedCaption).toBeNull();
    expect(
      parseContributionSummary(contributionJson({ suggestedCaption: "海风很大的一天" }))
        .suggestedCaption,
    ).toBe("海风很大的一天");
    expect(
      parseContributionSummary(contributionJson({ suggestedCaption: null })).suggestedCaption,
    ).toBeNull();
  });

  it("非法投稿状态/来源被拒绝，投稿人字段严格解码", () => {
    expect(() =>
      parseContributionSummary(contributionJson({ status: "uploading" })),
    ).toThrow();
    expect(() =>
      parseContributionSummary(
        contributionJson({ location: { name: "x", latitude: null, longitude: null, source: "ai" } }),
      ),
    ).toThrow();
    expect(() => parseContributorBrief({ contributorId: "x", username: "y" })).toThrow();
  });

  it("ContributionUploadResponse 解码成功投稿与逐文件失败", () => {
    const parsed = parseContributionUploadResponse({
      contributions: [contributionJson({ status: "draft", adoption: null })],
      failures: [{ fileName: "too-large.jpg", reason: "UPLOAD_TOO_LARGE" }],
    });
    expect(parsed.contributions[0]!.status).toBe("draft");
    expect(parsed.failures).toEqual([{ fileName: "too-large.jpg", reason: "UPLOAD_TOO_LARGE" }]);
    expect(() =>
      parseContributionUploadResponse({ contributions: [], failures: [{ fileName: "x", reason: "OTHER" }] }),
    ).toThrow();
  });

  it("邀请 / 管理 / 参与 DTO 解码", () => {
    expect(
      parseContributionInviteCreated({
        inviteId: "7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b",
        token: "token-abc",
        createdAt: "2026-11-03T01:20:00Z",
      }).token,
    ).toBe("token-abc");
    expect(parseContributionInviteSummary({ id: "x", status: "closed", createdAt: "2026-11-03T01:20:00Z", closedAt: null }).status).toBe("closed");
    expect(
      parseContributionInvitePreview({ exhibitionTitle: "雨中的济州", inviterName: "林间拾光", status: "active" }),
    ).toEqual({
      exhibitionTitle: "雨中的济州",
      inviterName: "林间拾光",
      status: "active",
    });
    expect(() => parseContributionInvitePreview({ exhibitionTitle: "雨中的济州", status: "active" })).toThrow();
    expect(
      parseContributionMembershipView({
        exhibitionId: "0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10",
        exhibitionTitle: "雨中的济州",
        status: "active",
        joinedAt: "2026-11-03T01:30:00Z",
      }).status,
    ).toBe("active");
    const management = parseContributionManagementResponse({
      invites: [{ id: "x", status: "active", createdAt: "2026-11-03T01:20:00Z", closedAt: null }],
      participants: [
        {
          contributorId: "c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b",
          username: "island_walker",
          displayName: "海风",
          status: "revoked",
          joinedAt: "2026-11-03T01:30:00Z",
          contributionCount: 2,
        },
      ],
    });
    expect(management.participants[0]!.status).toBe("revoked");
  });

  it("PhotoView.memories 严格解码、缺字段兼容 []（旧后端/旧样例）", () => {
    expect(parsePhotoView(photoJson()).memories).toEqual([]);
    const withMemory = parsePhotoView(
      photoJson({
        memories: [
          {
            memoryId: "8f9a0b1c-2d3e-4f5a-9b6c-7d8e9f0a1b2c",
            text: "海风很大。",
            contributorName: "海风",
          },
        ],
      }),
    );
    expect(withMemory.memories).toHaveLength(1);
    expect(withMemory.memories[0]!.text).toBe("海风很大。");
  });

  it("PublicPhotoView.memories 缺字段兼容 []（旧快照），存在时按署名解码", () => {
    expect(parsePublicPhotoView(publicPhotoJson()).memories).toEqual([]);
    const withMemory = parsePublicPhotoView(
      publicPhotoJson({ memories: [{ text: "海风很大。", contributorName: "海风" }] }),
    );
    expect(withMemory.memories).toEqual([{ text: "海风很大。", contributorName: "海风" }]);
  });
});
