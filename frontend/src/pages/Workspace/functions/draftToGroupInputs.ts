import type { GroupInput } from "../../../objects/gallery/GroupInput";
import type { CurationDraft } from "../objects/CurationDraft";

/** 草稿 → updatecuration 请求体（唯一序列化入口，避免 UI 各区域各自拼结构）。 */
export const draftToGroupInputs = (draft: CurationDraft): readonly GroupInput[] =>
  draft.groups.map((group) => ({
    title: group.title,
    narrative: group.narrative,
    photos: group.photos.map((photo) => ({ photoId: photo.photoId, caption: photo.caption })),
  }));
