import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { PhotoView } from "../../../objects/gallery/PhotoView";
import { collectPhotos } from "./collectPhotos";
import type { CurationDraft } from "../objects/CurationDraft";

/** 本次草稿中尚未放进任何章节的照片（未分组托盘）。 */
export const unassignedPhotos = (
  detail: ExhibitionDetail,
  draft: CurationDraft,
): readonly PhotoView[] => {
  const assignedPhotoIds = new Set(
    draft.groups.flatMap((group) => group.photos.map((photo) => photo.photoId)),
  );
  return collectPhotos(detail).filter((photo) => !assignedPhotoIds.has(photo.id));
};
