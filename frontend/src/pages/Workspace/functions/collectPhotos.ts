import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { PhotoView } from "../../../objects/gallery/PhotoView";

/** 展览全部照片（章节内 + 未分组），用于封面选择等跨区域操作。 */
export const collectPhotos = (detail: ExhibitionDetail): readonly PhotoView[] => [
  ...detail.ungroupedPhotos,
  ...detail.groups.flatMap((group) => group.photos),
];
