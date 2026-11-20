import { requireObject, requireString } from "../../apis/shared/decode";

/** 契约 §2.1 CreateExhibitionResponse(exhibitionId)：createexhibition 的响应。 */
export interface CreateExhibitionResponse {
  readonly exhibitionId: string;
}

export const parseCreateExhibitionResponse = (
  value: unknown,
  path = "createExhibition",
): CreateExhibitionResponse => {
  const record = requireObject(value, path);
  return {
    exhibitionId: requireString(record.exhibitionId, `${path}.exhibitionId`),
  };
};
