import type { ExhibitionSummary } from "../../../objects/gallery/ExhibitionSummary";

/** 展览列表区域的判别联合状态：loading / empty / ready / error（spec 11.3）。 */
export type ExhibitionsListState =
  | { readonly status: "loading" }
  | { readonly status: "empty" }
  | { readonly status: "ready"; readonly exhibitions: readonly ExhibitionSummary[] }
  | { readonly status: "error"; readonly message: string };
