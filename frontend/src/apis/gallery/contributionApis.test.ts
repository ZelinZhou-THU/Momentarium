import { describe, expect, it, vi } from "vitest";
import { apiName } from "../shared/apiName";
import { contributionContentUrl } from "./contributionContent";
import { CreateContributionInviteAPI } from "./CreateContributionInviteAPI";
import { CreateContributionAPI } from "./CreateContributionAPI";
import { DeclineContributionAPI } from "./DeclineContributionAPI";
import { GetContributionManagementAPI } from "./GetContributionManagementAPI";
import { CloseContributionInviteAPI } from "./CloseContributionInviteAPI";
import { GetContributionInviteAPI } from "./GetContributionInviteAPI";
import { JoinContributionAPI } from "./JoinContributionAPI";
import { RevokeContributorAPI } from "./RevokeContributorAPI";
import { ListContributionsAPI } from "./ListContributionsAPI";
import { UpdateContributionAPI } from "./UpdateContributionAPI";
import { WithdrawContributionAPI } from "./WithdrawContributionAPI";
import { AdoptContributionAPI } from "./AdoptContributionAPI";
import { RemoveMemoryAPI } from "./RemoveMemoryAPI";
import { UploadContributionsAPI } from "./UploadContributionsAPI";

vi.mock("../../stores/sessionStore", () => ({
  getSessionToken: (): string | null => null,
}));

const CONTRIBUTION_APIS = [
  [CreateContributionInviteAPI, "createcontributioninvite"],
  [GetContributionManagementAPI, "getcontributionmanagement"],
  [CloseContributionInviteAPI, "closecontributioninvite"],
  [GetContributionInviteAPI, "getcontributioninvite"],
  [JoinContributionAPI, "joincontribution"],
  [RevokeContributorAPI, "revokecontributor"],
  [ListContributionsAPI, "listcontributions"],
  [UpdateContributionAPI, "updatecontribution"],
  [WithdrawContributionAPI, "withdrawcontribution"],
  [AdoptContributionAPI, "adoptcontribution"],
  [RemoveMemoryAPI, "removememory"],
  [CreateContributionAPI, "createcontribution"],
  [DeclineContributionAPI, "declinecontribution"],
] as const;

describe("阶段 2 / 2.5 投稿 API 类", () => {
  it("13 个消息 API 类名经 apiName 推导与契约路由名一致", () => {
    for (const [apiClass, routeName] of CONTRIBUTION_APIS) {
      expect(apiName(apiClass.name), apiClass.name).toBe(routeName);
    }
  });

  it("投稿私有图片 URL 只在非消息路由构造，不进入通用 API 基类", () => {
    expect(contributionContentUrl("c-1", "thumb")).toBe(
      "/api/contributions/c-1/content?variant=thumb",
    );
    expect(contributionContentUrl("c 1", "full")).toBe(
      "/api/contributions/c%201/content?variant=full",
    );
    const upload = new UploadContributionsAPI("ex-1", [], null);
    expect(upload.contributionId).toBeNull();
  });

  it("listcontributions 默认 exhibitionId=null（按角色范围由服务端决定）", () => {
    expect(new ListContributionsAPI().exhibitionId).toBeNull();
    expect(new ListContributionsAPI("ex-1").exhibitionId).toBe("ex-1");
  });

  it("create/update 携带可空建议图注；v1.12 create 不再有 submit", () => {
    expect(new CreateContributionAPI("ex-1", "一段回忆").suggestedCaption).toBeNull();
    expect(
      new CreateContributionAPI("ex-1", "一段回忆", "海风很大的一天").suggestedCaption,
    ).toBe("海风很大的一天");
    expect(new UpdateContributionAPI("c-1", "一段回忆").suggestedCaption).toBeNull();
    expect(
      new UpdateContributionAPI("c-1", "一段回忆", null, false, true, "海风很大的一天")
        .suggestedCaption,
    ).toBe("海风很大的一天");
  });

  it("adopt 去掉 targetPhotoId，只提交 expectedVersion/caption/location（v1.12）", () => {
    const adopt = new AdoptContributionAPI(
      "c-1",
      3,
      "海风很大的一天",
      { name: "涯月邑", latitude: 33.46, longitude: 126.3, granularity: "area" },
    );
    expect(adopt.contributionId).toBe("c-1");
    expect(adopt.expectedVersion).toBe(3);
    expect(adopt.caption).toBe("海风很大的一天");
    expect(adopt.location?.granularity).toBe("area");
    expect("targetPhotoId" in adopt).toBe(false);
  });
});
