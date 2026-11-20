import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { CurationDraft } from "../objects/CurationDraft";
import { collectPhotos } from "./collectPhotos";

/**
 * 有未保存修改时详情被刷新（上传 / 删除照片 / 换封面）：保留用户的草稿，
 * 只剔除服务端已不存在的照片；新上传的照片不在任何章节里，自然出现在"未分组"托盘。
 */
export const rebaseCurationDraft = (draft: CurationDraft, detail: ExhibitionDetail): CurationDraft => {
  const existingPhotoIds = new Set(collectPhotos(detail).map((photo) => photo.id));
  return {
    ...draft,
    groups: draft.groups.map((group) => ({
      ...group,
      photos: group.photos.filter((photo) => existingPhotoIds.has(photo.photoId)),
    })),
  };
};
