import { matchPath } from "react-router-dom";

/** 属于某个展览的页面：工作台及其子页（版本历史、记忆档案、看展预览）与公开看展页。 */
const EXHIBITION_ROUTE_PATTERNS = ["/exhibitions/:id/*", "/show/:id"] as const;

/** 当前路径所属展览的 id；展览列表、账户、作者主页等不属于单个展览的页面返回 null。 */
export const exhibitionIdOfPath = (pathname: string): string | null =>
  EXHIBITION_ROUTE_PATTERNS.map((pattern) => matchPath(pattern, pathname)?.params.id).find(
    (id): id is string => id !== undefined && id !== "",
  ) ?? null;
