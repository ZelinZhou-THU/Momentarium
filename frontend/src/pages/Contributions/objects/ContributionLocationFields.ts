import type { PlaceCandidate } from "../../../objects/gallery/PlaceSearchResponse";

/** 投稿编辑器里地点的三个受控输入（保留原始字符串，保存前统一校验）。 */
export interface ContributionLocationFields {
  readonly name: string;
  readonly latitude: string;
  readonly longitude: string;
}

/** 地点搜索状态：0 结果不是错误。 */
export type PlaceSearchState =
  | { readonly status: "idle" }
  | { readonly status: "searching" }
  | { readonly status: "results"; readonly candidates: readonly PlaceCandidate[] }
  | { readonly status: "empty" }
  | { readonly status: "error"; readonly message: string };
