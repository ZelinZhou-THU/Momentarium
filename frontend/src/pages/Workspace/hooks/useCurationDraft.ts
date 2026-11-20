import { useEffect, useRef, useState } from "react";
import { UpdateCurationAPI } from "../../../apis/gallery/UpdateCurationAPI";
import { describeCurationError } from "../../../apis/curation/describeCurationError";
import { ApiError } from "../../../apis/shared/ApiError";
import { clearSession } from "../../../stores/sessionStore";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { PhotoView } from "../../../objects/gallery/PhotoView";
import { buildCurationDraft } from "../functions/buildCurationDraft";
import { draftToGroupInputs } from "../functions/draftToGroupInputs";
import { isCurationDraftDirty } from "../functions/isCurationDraftDirty";
import { rebaseCurationDraft } from "../functions/rebaseCurationDraft";
import type {
  CurationDraft,
  CurationDraftGroup,
  CurationSaveState,
} from "../objects/CurationDraft";

export interface CurationDraftModel {
  readonly draft: CurationDraft;
  readonly isDirty: boolean;
  readonly saveState: CurationSaveState;
  readonly updateTitle: (title: string) => void;
  readonly updateNarrative: (narrative: string) => void;
  readonly updateGroupTitle: (groupIndex: number, title: string) => void;
  readonly updateGroupNarrative: (groupIndex: number, narrative: string) => void;
  readonly updatePhotoCaption: (groupIndex: number, photoIndex: number, caption: string) => void;
  readonly movePhoto: (groupIndex: number, photoIndex: number, direction: "up" | "down") => void;
  readonly addPhotosToGroup: (groupIndex: number, photos: readonly PhotoView[]) => void;
  readonly removePhotoFromGroup: (groupIndex: number, photoIndex: number) => void;
  readonly addGroup: () => void;
  readonly removeGroup: (groupIndex: number) => void;
  readonly moveGroup: (groupIndex: number, direction: "up" | "down") => void;
  readonly replaceGroups: (groups: readonly CurationDraftGroup[]) => void;
  readonly save: () => void;
  /** 放弃全部未保存修改，回到服务端当前版本。 */
  readonly discard: () => void;
}

const updateGroupAt = (
  draft: CurationDraft,
  groupIndex: number,
  update: (group: CurationDraftGroup) => CurationDraftGroup,
): CurationDraft => ({
  ...draft,
  groups: draft.groups.map((group, index) => (index === groupIndex ? update(group) : group)),
});

const moveWithinList = <T,>(list: readonly T[], from: number, to: number): readonly T[] => {
  if (from === to || to < 0 || to >= list.length) {
    return list;
  }
  const next = [...list];
  const moved = next[from];
  if (moved === undefined) {
    return list;
  }
  next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/**
 * 策展草稿编辑：所有编辑都是纯不可变更新；save 调 updatecuration 整体替换，成功后由父级 reload 详情。
 * 详情版本（updatedAt）变化时：保存后或草稿无修改 → 重置为服务端版本；
 * 有未保存修改（期间上传/删除了照片）→ 保留草稿，只剔除已不存在的照片（rebaseCurationDraft）。
 */
export const useCurationDraft = (
  detail: ExhibitionDetail,
  onSaved: () => void,
): CurationDraftModel => {
  const [draft, setDraft] = useState<CurationDraft>(() => buildCurationDraft(detail));
  const [saveState, setSaveState] = useState<CurationSaveState>({ status: "idle" });
  /** 草稿上次对齐时的服务端详情：判断"刷新前是否有未保存修改"。 */
  const baselineDetailRef = useRef(detail);
  /** 刚保存成功：下一次详情变化一律重置（服务端可能规范化内容，不能当作未保存修改保留）。 */
  const resetOnNextDetailRef = useRef(false);

  useEffect(() => {
    // 只在服务端草稿版本变化（updatedAt 变化）时对齐；场景评审等静默刷新不会改动 updatedAt。
    const previousDetail = baselineDetailRef.current;
    baselineDetailRef.current = detail;
    if (previousDetail.updatedAt === detail.updatedAt) {
      return;
    }
    const forceReset = resetOnNextDetailRef.current;
    resetOnNextDetailRef.current = false;
    setDraft((current) =>
      !forceReset && isCurationDraftDirty(previousDetail, current)
        ? rebaseCurationDraft(current, detail)
        : buildCurationDraft(detail),
    );
    setSaveState({ status: "idle" });
  }, [detail.updatedAt]);

  const updateGroup = (groupIndex: number, update: (group: CurationDraftGroup) => CurationDraftGroup) => {
    setDraft((current) => updateGroupAt(current, groupIndex, update));
  };

  const save = () => {
    setSaveState({ status: "saving" });
    new UpdateCurationAPI(detail.id, draft.title, draft.narrative, draftToGroupInputs(draft)).send().then(
      () => {
        resetOnNextDetailRef.current = true;
        setSaveState({ status: "idle" });
        onSaved();
      },
      (error: unknown) => {
        if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
          clearSession();
          return;
        }
        setSaveState({ status: "failed", message: describeCurationError(error) });
      },
    );
  };

  return {
    draft,
    isDirty: isCurationDraftDirty(detail, draft),
    saveState,
    updateTitle: (title) => setDraft((current) => ({ ...current, title })),
    updateNarrative: (narrative) => setDraft((current) => ({ ...current, narrative })),
    updateGroupTitle: (groupIndex, title) => updateGroup(groupIndex, (group) => ({ ...group, title })),
    updateGroupNarrative: (groupIndex, narrative) =>
      updateGroup(groupIndex, (group) => ({ ...group, narrative })),
    updatePhotoCaption: (groupIndex, photoIndex, caption) =>
      updateGroup(groupIndex, (group) => ({
        ...group,
        photos: group.photos.map((photo, index) =>
          index === photoIndex ? { ...photo, caption } : photo,
        ),
      })),
    movePhoto: (groupIndex, photoIndex, direction) =>
      updateGroup(groupIndex, (group) => ({
        ...group,
        photos: moveWithinList(
          group.photos,
          photoIndex,
          direction === "up" ? photoIndex - 1 : photoIndex + 1,
        ),
      })),
    addPhotosToGroup: (groupIndex, photos) =>
      updateGroup(groupIndex, (group) => ({
        ...group,
        photos: [
          ...group.photos,
          ...photos.map((photo) => ({ photoId: photo.id, caption: photo.caption })),
        ],
      })),
    removePhotoFromGroup: (groupIndex, photoIndex) =>
      updateGroup(groupIndex, (group) => ({
        ...group,
        photos: group.photos.filter((_, index) => index !== photoIndex),
      })),
    addGroup: () =>
      setDraft((current) => ({
        ...current,
        groups: [...current.groups, { title: "新章节", narrative: "", photos: [] }],
      })),
    removeGroup: (groupIndex) =>
      setDraft((current) => ({
        ...current,
        groups: current.groups.filter((_, index) => index !== groupIndex),
      })),
    moveGroup: (groupIndex, direction) =>
      setDraft((current) => ({
        ...current,
        groups: moveWithinList(
          current.groups,
          groupIndex,
          direction === "up" ? groupIndex - 1 : groupIndex + 1,
        ),
      })),
    replaceGroups: (groups) => setDraft((current) => ({ ...current, groups })),
    save,
    discard: () => {
      setDraft(buildCurationDraft(detail));
      setSaveState({ status: "idle" });
    },
  };
};
