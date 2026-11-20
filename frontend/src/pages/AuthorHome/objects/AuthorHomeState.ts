import type { AuthorPageView } from "../../../objects/gallery/AuthorPageView";

/** 作者主页：loading / ready / notFound（不存在或未公开，同一提示）/ error。 */
export type AuthorHomeState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly page: AuthorPageView }
  | { readonly status: "notFound" }
  | { readonly status: "error"; readonly message: string };
