import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import { buildCurationDraft } from "./buildCurationDraft";
import type { CurationDraft } from "../objects/CurationDraft";

const samePhoto = (left: CurationDraft["groups"][number]["photos"][number], right: CurationDraft["groups"][number]["photos"][number]): boolean =>
  left.photoId === right.photoId && left.caption === right.caption;

const sameGroups = (left: CurationDraft["groups"], right: CurationDraft["groups"]): boolean =>
  left.length === right.length &&
  left.every((group, groupIndex) => {
    const other = right[groupIndex];
    return (
      other !== undefined &&
      group.title === other.title &&
      group.narrative === other.narrative &&
      group.photos.length === other.photos.length &&
      group.photos.every((photo, photoIndex) => {
        const otherPhoto = other.photos[photoIndex];
        return otherPhoto !== undefined && samePhoto(photo, otherPhoto);
      })
    );
  });

/** 草稿与当前服务端详情是否一致（决定“有未保存修改”提示与保存按钮可用性）。 */
export const isCurationDraftDirty = (
  detail: ExhibitionDetail,
  draft: CurationDraft,
): boolean => {
  const baseline = buildCurationDraft(detail);
  return (
    draft.title !== baseline.title ||
    draft.narrative !== baseline.narrative ||
    !sameGroups(draft.groups, baseline.groups)
  );
};
