import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { CurationDraft } from "../objects/CurationDraft";

/** 服务端详情 → 可编辑草稿（初始基线，也用于保存/上传后的重置）。 */
export const buildCurationDraft = (detail: ExhibitionDetail): CurationDraft => ({
  title: detail.title,
  narrative: detail.narrative,
  groups: detail.groups.map((group) => ({
    title: group.title,
    narrative: group.narrative,
    photos: group.photos.map((photo) => ({ photoId: photo.id, caption: photo.caption })),
  })),
});
