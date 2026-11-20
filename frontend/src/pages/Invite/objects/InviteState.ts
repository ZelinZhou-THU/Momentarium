import type { ContributionInvitePreview } from "../../../objects/gallery/ContributionInvite";
import type { ContributionMembershipView } from "../../../objects/gallery/ContributionInvite";

/** 邀请页已读数据三态：加载 / 链接不存在（404）/ 错误 / 就绪（只含标题与状态）。 */
export type InviteLoadState =
  | { readonly status: "loading" }
  | { readonly status: "notfound" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly preview: ContributionInvitePreview };

/** 加入状态：未登录时保持 idle（页面给出登录/注册入口）。 */
export type InviteJoinState =
  | { readonly status: "idle" }
  | { readonly status: "joining" }
  | { readonly status: "joined"; readonly membership: ContributionMembershipView }
  | { readonly status: "error"; readonly message: string };
