import { requireObject, requireString } from "../../apis/shared/decode";

/** 契约 §2.1 ExhibitionPhotoInput(photoId, caption)：updatecuration 请求中的照片项。 */
export interface ExhibitionPhotoInput {
  readonly photoId: string;
  readonly caption: string;
}

export const parseExhibitionPhotoInput = (
  value: unknown,
  path = "exhibitionPhoto",
): ExhibitionPhotoInput => {
  const record = requireObject(value, path);
  return {
    photoId: requireString(record.photoId, `${path}.photoId`),
    caption: requireString(record.caption, `${path}.caption`),
  };
};
