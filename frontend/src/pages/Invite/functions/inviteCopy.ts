import type { ContributionInvitePreview } from "../../../objects/gallery/ContributionInvite";

/** 邀请令牌 → 邀请页站内路径（登录/注册后回跳用）。 */
export const inviteReturnPath = (token: string): string =>
  `/invite/${encodeURIComponent(token)}`;

/** 公开邀请页的文案：只谈标题与是否可加入，不提任何私有内容。 */
export const describeInviteStatus = (preview: ContributionInvitePreview): string =>
  preview.status === "active"
    ? "邀请仍然有效，登录后即可加入：写下一段回忆，并附一张照片。"
    : "邀请链接已关闭，无法再加入；已加入的参与者仍可继续补写回忆与照片。";

/** 是否可加入（关闭的链接即便未登录也不引导登录）。 */
export const canJoinInvite = (preview: ContributionInvitePreview): boolean =>
  preview.status === "active";

/** 加入成功后的「我参与的」地址：带 exhibitionId 便于直接写第一段回忆。 */
export const contributionsPathForMembership = (
  exhibitionId: string,
  exhibitionTitle: string,
): string =>
  `/contributions?exhibitionId=${encodeURIComponent(exhibitionId)}&title=${encodeURIComponent(exhibitionTitle)}`;
