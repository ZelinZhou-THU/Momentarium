import { requireArray, requireObject } from "../../apis/shared/decode";
import { parseExhibitionSummary } from "./ExhibitionSummary";
import type { ExhibitionSummary } from "./ExhibitionSummary";

/** 契约 §2.1 MyExhibitionsResponse(exhibitions)：listmyexhibitions 的响应。 */
export interface MyExhibitionsResponse {
  readonly exhibitions: ExhibitionSummary[];
}

export const parseMyExhibitionsResponse = (
  value: unknown,
  path = "myExhibitions",
): MyExhibitionsResponse => {
  const record = requireObject(value, path);
  return {
    exhibitions: requireArray(record.exhibitions, `${path}.exhibitions`).map(
      (exhibition, index) => parseExhibitionSummary(exhibition, `${path}.exhibitions[${index}]`),
    ),
  };
};
