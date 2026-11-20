import { requireArray, requireNumber, requireObject, requireString } from "../../apis/shared/decode";
import { parsePhotoView } from "./PhotoView";
import type { PhotoView } from "./PhotoView";

/** 契约 §2.1 GroupView：策展章节（标题、叙事、顺序、照片列表）。 */
export interface GroupView {
  readonly id: string;
  readonly title: string;
  readonly narrative: string;
  readonly position: number;
  readonly photos: PhotoView[];
}

export const parseGroupView = (value: unknown, path = "group"): GroupView => {
  const record = requireObject(value, path);
  return {
    id: requireString(record.id, `${path}.id`),
    title: requireString(record.title, `${path}.title`),
    narrative: requireString(record.narrative, `${path}.narrative`),
    position: requireNumber(record.position, `${path}.position`),
    photos: requireArray(record.photos, `${path}.photos`).map((photo, index) =>
      parsePhotoView(photo, `${path}.photos[${index}]`),
    ),
  };
};
