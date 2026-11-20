/**
 * 投稿私有图片 URL 构造（契约 §5.6）。
 * 该路由需要登录令牌（投稿者本人或展览创建者）；页面用 useAuthorizedImage/AuthorizedPhotoThumb 带 Bearer 取图，
 * 邀请令牌不参与授权。这里只负责拼路径，不进入通用 API 基类。
 */
export type ContributionImageVariant = "thumb" | "full";

export const contributionContentUrl = (
  contributionId: string,
  variant: ContributionImageVariant,
): string =>
  `/api/contributions/${encodeURIComponent(contributionId)}/content?variant=${variant}`;

/**
 * 投稿图片可被投稿者替换而 URL 不变：把投稿版本号拼进查询串（后端忽略多余参数），
 * 让共享图片缓存把新版本当成新条目。
 */
export const versionedContributionImageUrl = (url: string, version: number): string =>
  `${url}&v=${version}`;
