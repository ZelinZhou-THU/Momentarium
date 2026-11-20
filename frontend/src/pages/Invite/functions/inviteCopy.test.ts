import { describe, expect, it } from "vitest";
import {
  canJoinInvite,
  contributionsPathForMembership,
  describeInviteStatus,
  inviteReturnPath,
} from "./inviteCopy";

describe("公开邀请页文案与回跳", () => {
  it("编码 token，回到邀请页；加入后带上展览 id/title 去我的投稿", () => {
    expect(inviteReturnPath("a b/c")).toBe("/invite/a%20b%2Fc");
    expect(contributionsPathForMembership("ex-1", "雨中的济州")).toBe(
      "/contributions?exhibitionId=ex-1&title=%E9%9B%A8%E4%B8%AD%E7%9A%84%E6%B5%8E%E5%B7%9E",
    );
  });

  it("有效邀请可加入；关闭邀请不可加入且文案说明", () => {
    expect(canJoinInvite({ exhibitionTitle: "雨中的济州", inviterName: "林间拾光", status: "active" })).toBe(true);
    expect(canJoinInvite({ exhibitionTitle: "雨中的济州", inviterName: "林间拾光", status: "closed" })).toBe(false);
    expect(describeInviteStatus({ exhibitionTitle: "雨中的济州", inviterName: "林间拾光", status: "active" })).toContain(
      "邀请仍然有效",
    );
    expect(describeInviteStatus({ exhibitionTitle: "雨中的济州", inviterName: "林间拾光", status: "closed" })).toContain(
      "无法再加入",
    );
  });
});
