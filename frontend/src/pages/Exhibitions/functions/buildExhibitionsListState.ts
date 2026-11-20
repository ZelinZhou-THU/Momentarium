import type { ExhibitionSummary } from "../../../objects/gallery/ExhibitionSummary";
import type { ExhibitionsListState } from "../objects/ExhibitionsPage";

/** 列表接口结果 → 页面状态（空列表单独建模，便于渲染空态）。 */
export const buildExhibitionsListState = (
  exhibitions: readonly ExhibitionSummary[],
): ExhibitionsListState =>
  exhibitions.length === 0
    ? { status: "empty" }
    : { status: "ready", exhibitions };
