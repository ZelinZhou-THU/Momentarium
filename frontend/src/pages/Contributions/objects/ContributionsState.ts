import type { ContributionSummary } from "../../../objects/gallery/Contribution";
import type { ContributionLocationInput } from "../../../objects/gallery/Contribution";

/** 我参与的页数据三态。 */
export type ContributionsLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly contributions: readonly ContributionSummary[] };

/** 编辑器校验结果：回忆必填与否由「保存草稿/提交」决定；位置可选。 */
export type ContributionEditorValidation =
  | {
      readonly ok: true;
      readonly memoryText: string;
      readonly location: ContributionLocationInput | null;
    }
  | { readonly ok: false; readonly message: string };

export interface ContributionExhibitionGroup {
  readonly exhibitionId: string;
  readonly exhibitionTitle: string;
  readonly contributions: readonly ContributionSummary[];
}

/** 编辑器打开状态：新建一段回忆，或修改已有回忆。 */
export type ContributionEditorTarget =
  | { readonly kind: "create"; readonly exhibitionId: string; readonly exhibitionTitle: string }
  | { readonly kind: "edit"; readonly contribution: ContributionSummary };
