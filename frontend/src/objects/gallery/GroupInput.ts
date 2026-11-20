import { requireArray, requireObject, requireString } from "../../apis/shared/decode";
import { parseExhibitionPhotoInput } from "./ExhibitionPhotoInput";
import type { ExhibitionPhotoInput } from "./ExhibitionPhotoInput";

/** 契约 §2.1 GroupInput(title, narrative, photos)：策展章节的写入形态（updatecuration / 提案）。 */
export interface GroupInput {
  readonly title: string;
  readonly narrative: string;
  readonly photos: readonly ExhibitionPhotoInput[];
}

export const parseGroupInput = (value: unknown, path = "groupInput"): GroupInput => {
  const record = requireObject(value, path);
  return {
    title: requireString(record.title, `${path}.title`),
    narrative: requireString(record.narrative, `${path}.narrative`),
    photos: requireArray(record.photos, `${path}.photos`).map((photo, index) =>
      parseExhibitionPhotoInput(photo, `${path}.photos[${index}]`),
    ),
  };
};
