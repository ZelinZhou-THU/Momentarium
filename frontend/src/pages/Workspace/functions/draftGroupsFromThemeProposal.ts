import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { ThemeProposal } from "../../../objects/curation/ThemeProposal";
import type { CurationDraftGroup } from "../objects/CurationDraft";
import { collectPhotos } from "./collectPhotos";

/**
 * 主题提案 → 草稿章节：提案只带 photoIds，叙事留空，图注沿用照片现有图注；
 * 应用后仍需用户点保存（updatecuration）才落库，AI 不直接改库。
 */
export const draftGroupsFromThemeProposal = (
  proposal: ThemeProposal,
  detail: ExhibitionDetail,
): readonly CurationDraftGroup[] => {
  const captionByPhotoId = new Map(
    collectPhotos(detail).map((photo) => [photo.id, photo.caption]),
  );
  return proposal.groups.map((group) => ({
    title: group.title,
    narrative: "",
    photos: group.photoIds.map((photoId) => ({
      photoId,
      caption: captionByPhotoId.get(photoId) ?? "",
    })),
  }));
};
