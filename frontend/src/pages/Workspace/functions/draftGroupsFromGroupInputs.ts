import type { GroupInput } from "../../../objects/gallery/GroupInput";
import type { CurationDraftGroup } from "../objects/CurationDraft";

/** CurationProposal.groups（GroupInput[]）→ 草稿章节（refinecuration 应用）。 */
export const draftGroupsFromGroupInputs = (
  groups: readonly GroupInput[],
): readonly CurationDraftGroup[] =>
  groups.map((group) => ({
    title: group.title,
    narrative: group.narrative,
    photos: group.photos.map((photo) => ({ photoId: photo.photoId, caption: photo.caption })),
  }));
