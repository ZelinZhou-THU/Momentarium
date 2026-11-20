import type { AuthorPageView } from "../../../objects/gallery/AuthorPageView";

export interface AuthorHomeHeading {
  readonly displayName: string;
  /** 显示名与用户名不同时才显示 @username，避免重复。 */
  readonly handle: string | null;
  readonly countLabel: string;
}

export const describeAuthorHome = (page: AuthorPageView): AuthorHomeHeading => ({
  displayName: page.displayName,
  handle: page.displayName === page.username ? null : `@${page.username}`,
  countLabel: page.exhibitions.length === 0 ? "还没有公开的展览" : `${page.exhibitions.length} 个公开展览`,
});

/** ISO 时间 → 「2026年10月31日」。 */
export const formatPublishedDate = (iso: string): string =>
  new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(iso));
