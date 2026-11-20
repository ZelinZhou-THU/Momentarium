import { describe, expect, it, vi } from "vitest";
import { apiName } from "../shared/apiName";
import { ConfirmPhotoLocationCandidateAPI } from "./ConfirmPhotoLocationCandidateAPI";
import { GetPhotoLocationCandidatesAPI } from "./GetPhotoLocationCandidatesAPI";
import { SuggestPhotoLocationAPI } from "./SuggestPhotoLocationAPI";

vi.mock("../../stores/sessionStore", () => ({
  getSessionToken: (): string | null => null,
}));

describe("AI 地点候选 API 类（v1.13）", () => {
  it("3 个 curation 消息 API 类名经 apiName 推导与契约路由名一致", () => {
    expect(apiName(SuggestPhotoLocationAPI.name)).toBe("suggestphotolocation");
    expect(apiName(GetPhotoLocationCandidatesAPI.name)).toBe("getphotolocationcandidates");
    expect(apiName(ConfirmPhotoLocationCandidateAPI.name)).toBe("confirmphotolocationcandidate");
  });

  it("请求字段：photoId；确认再带 candidateId/granularity", () => {
    expect(new SuggestPhotoLocationAPI("photo-1").photoId).toBe("photo-1");
    expect(new GetPhotoLocationCandidatesAPI("photo-1").photoId).toBe("photo-1");
    const confirm = new ConfirmPhotoLocationCandidateAPI("photo-1", "cand-1", "hidden");
    expect(confirm.photoId).toBe("photo-1");
    expect(confirm.candidateId).toBe("cand-1");
    expect(confirm.granularity).toBe("hidden");
  });
});
