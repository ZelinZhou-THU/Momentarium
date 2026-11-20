import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";

/** 展览照片总数（章节内 + 未分组），页头与面板复用。 */
export const countPhotos = (detail: ExhibitionDetail): number =>
  detail.groups.reduce((sum, group) => sum + group.photos.length, detail.ungroupedPhotos.length);
