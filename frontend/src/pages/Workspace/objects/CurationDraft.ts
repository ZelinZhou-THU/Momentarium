/** 工作台策展草稿：页面级编辑模型（由 ExhibitionDetail 派生，保存时转 GroupInput）。 */

export interface CurationDraftPhoto {
  readonly photoId: string;
  readonly caption: string;
}

export interface CurationDraftGroup {
  readonly title: string;
  readonly narrative: string;
  readonly photos: readonly CurationDraftPhoto[];
}

export interface CurationDraft {
  readonly title: string;
  readonly narrative: string;
  readonly groups: readonly CurationDraftGroup[];
}

/** 保存状态：空闲 / 保存中 / 失败（成功后由父级重新拉取详情并重置草稿）。 */
export type CurationSaveState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | { readonly status: "failed"; readonly message: string };
