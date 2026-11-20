import { ApiError } from "../../../apis/shared/ApiError";
import { isValidLatitude, isValidLongitude } from "../../../objects/gallery/GeoPoint";
import type { ContributionSummary } from "../../../objects/gallery/Contribution";
import type {
  ContributionEditorValidation,
  ContributionExhibitionGroup,
} from "../objects/ContributionsState";

/** 提交时回忆长度上限（去首尾空白后的 Unicode 码点）；纯文字不限条数，照片受展览配额约束。 */
export const CONTRIBUTION_MAX_MEMORY_CODE_POINTS = 1000;
export const CONTRIBUTION_MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const CONTRIBUTION_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const codePointLength = (value: string): number => [...value].length;

/** 按展览分组（保持服务端顺序，同展览连续合并）。 */
export const groupContributionsByExhibition = (
  contributions: readonly ContributionSummary[],
): readonly ContributionExhibitionGroup[] => {
  const groups: ContributionExhibitionGroup[] = [];
  contributions.forEach((contribution) => {
    const existing = groups.find((group) => group.exhibitionId === contribution.exhibitionId);
    if (existing === undefined) {
      groups.push({
        exhibitionId: contribution.exhibitionId,
        exhibitionTitle: contribution.exhibitionTitle,
        contributions: [contribution],
      });
      return;
    }
    const index = groups.indexOf(existing);
    groups[index] = { ...existing, contributions: [...existing.contributions, contribution] };
  });
  return groups;
};

/** 回忆状态文案（回忆优先：先看文字，再谈照片）。 */
export const describeContributionStatus = (contribution: ContributionSummary): string => {
  switch (contribution.status) {
    case "withdrawn":
      return "已撤回";
    case "declined":
      return "未被采用 · 可修改后重新提交";
    case "draft":
      return "草稿";
    case "submitted":
      if (contribution.adoption === null) {
        return "待策展人查看";
      }
      return contribution.hasPendingUpdate
        ? `已采用第 ${contribution.adoption.adoptedVersion} 版 · 修改待确认`
        : `已采用第 ${contribution.adoption.adoptedVersion} 版`;
  }
};

/**
 * 已采用回忆的去向（v1.16）：策展人采用后，讲述是否已随展览公开、没公开时要等什么。
 * 没有被采用时返回 null（状态文案已经说明）。
 */
export const describeAdoptionDestination = (contribution: ContributionSummary): string | null => {
  if (contribution.adoption === null) {
    return null;
  }
  const where = contribution.memoryPublished
    ? "已采用的这一版讲述已随展览公开。"
    : contribution.exhibitionPublished
      ? "展览发布在采用之前，等策展人重新发布后这段讲述才会公开。"
      : "展览还没有发布，发布后这段讲述会一起公开。";
  return contribution.hasPendingUpdate
    ? `${where}你后来的修改正等待策展人确认，确认并重新发布后才会公开。`
    : where;
};

/** 公开展览页路径；展览没有发布时没有可看的页面。 */
export const publicExhibitionPathOf = (contribution: ContributionSummary): string | null =>
  contribution.exhibitionPublished ? `/show/${contribution.exhibitionId}` : null;

/** 纯文字回忆不显示缩略图；v1.12 起新投稿必须有照片，file=null 只可能是历史/未附图的草稿。 */
export const describeContributionMedia = (contribution: ContributionSummary): string => {
  if (contribution.file !== null) {
    return "含 1 张照片";
  }
  return contribution.status === "draft" ? "草稿 · 未附图" : "历史纯文字回忆";
};

export const isTextOnlyContribution = (contribution: ContributionSummary): boolean =>
  contribution.file === null;

/** 历史纯文字（非草稿且无照片）：不能直接提交，需先补一张照片。 */
export const isHistoricalTextOnly = (contribution: ContributionSummary): boolean =>
  contribution.file === null && contribution.status !== "draft";

/** 提交必须有照片；保存草稿可暂缺。 */
export const PHOTO_REQUIRED_FOR_SUBMIT_MESSAGE = "提交需要一张照片；保存草稿可以暂不附图。";

export const hasPhotoForSubmit = (
  existingHasPhoto: boolean,
  newPhotoSelected: boolean,
  removePhoto: boolean,
): boolean => newPhotoSelected || (existingHasPhoto && !removePhoto);

export const validatePhotoForSubmit = (
  existingHasPhoto: boolean,
  newPhotoSelected: boolean,
  removePhoto: boolean,
): { readonly ok: true } | { readonly ok: false; readonly message: string } =>
  hasPhotoForSubmit(existingHasPhoto, newPhotoSelected, removePhoto)
    ? { ok: true }
    : { ok: false, message: PHOTO_REQUIRED_FOR_SUBMIT_MESSAGE };

export const needsReview = (contribution: ContributionSummary): boolean =>
  contribution.status === "submitted" &&
  (contribution.adoption === null || contribution.hasPendingUpdate);

export const isParticipantRevokedError = (error: unknown): boolean =>
  error instanceof ApiError && error.reason === "PARTICIPANT_REVOKED";

const parseCoordinate = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * 编辑器校验：保存草稿允许空回忆；提交要求 1–1000 码点。
 * 位置可整体留空；填写时坐标必须成对合法（经纬度同时为空表示不提供位置）。
 */
export const validateContributionEditor = (
  memoryText: string,
  requireMemoryForSubmit: boolean,
  locationName: string,
  latitudeText: string,
  longitudeText: string,
): ContributionEditorValidation => {
  const memory = memoryText.trim();
  if (requireMemoryForSubmit) {
    if (memory.length === 0) {
      return { ok: false, message: "请写下这段回忆再提交" };
    }
    if (codePointLength(memory) > CONTRIBUTION_MAX_MEMORY_CODE_POINTS) {
      return {
        ok: false,
        message: `回忆不能超过 ${CONTRIBUTION_MAX_MEMORY_CODE_POINTS} 个字`,
      };
    }
  } else if (codePointLength(memory) > CONTRIBUTION_MAX_MEMORY_CODE_POINTS) {
    return { ok: false, message: `回忆不能超过 ${CONTRIBUTION_MAX_MEMORY_CODE_POINTS} 个字` };
  }

  const name = locationName.trim();
  const latitude = parseCoordinate(latitudeText);
  const longitude = parseCoordinate(longitudeText);
  const hasLatitude = latitudeText.trim() !== "";
  const hasLongitude = longitudeText.trim() !== "";
  if (hasLatitude !== hasLongitude) {
    return { ok: false, message: "经纬度必须成对填写（或都留空）" };
  }
  if (!hasLatitude) {
    return {
      ok: true,
      memoryText: memory,
      location: name.length === 0 ? null : { name, latitude: null, longitude: null },
    };
  }
  if (name.length === 0) {
    return { ok: false, message: "填写坐标时请同时填写地点名称" };
  }
  if (latitude === null || !isValidLatitude(latitude)) {
    return { ok: false, message: "纬度无效：需为 -90 到 90 之间的数字" };
  }
  if (longitude === null || !isValidLongitude(longitude)) {
    return { ok: false, message: "经度无效：需为 -180 到 180 之间的数字" };
  }
  return { ok: true, memoryText: memory, location: { name, latitude, longitude } };
};

/** 一张可选照片的本地预检（服务端仍权威）。 */
export const validateContributionPhoto = (
  file: File,
): { readonly ok: true } | { readonly ok: false; readonly message: string } => {
  if (
    !CONTRIBUTION_PHOTO_MIME_TYPES.includes(
      file.type as (typeof CONTRIBUTION_PHOTO_MIME_TYPES)[number],
    )
  ) {
    return { ok: false, message: "照片格式不支持：仅 JPEG/PNG/WebP" };
  }
  if (file.size > CONTRIBUTION_MAX_PHOTO_BYTES) {
    return { ok: false, message: "照片不能超过 15 MiB" };
  }
  return { ok: true };
};

/** 照片配额提示；v1.12 起提交必须有照片（草稿可暂缺），纯文字只可能是历史数据。 */
export const describePhotoQuotaHint = (): string =>
  "一条回忆必须附 1 张照片（保存草稿可暂缺），照片会计入展览的照片配额。";

export const formatContributionTime = (iso: string): string =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** 撤回二次确认：说明草稿清理与服务端刷新结果为准，已发布快照不变。 */
export const WITHDRAW_CONTRIBUTION_CONFIRM_MESSAGE =
  "撤回后，草稿中由这段回忆采用的讲述、以及由它新建的照片会被移除；已发布版本不会改变，撤回后无法恢复。";

/** v1.11 建议图注：可选、≤120 码点；空串视为不提供（提交 null）。 */
export const CONTRIBUTION_MAX_SUGGESTED_CAPTION_CODE_POINTS = 120;

export type SuggestedCaptionValidation =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly message: string };

export const validateSuggestedCaption = (text: string): SuggestedCaptionValidation => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  if (/[\u0000-\u001F\u007F]/u.test(trimmed)) {
    return { ok: false, message: "建议图注不能包含换行或控制字符" };
  }
  if (codePointLength(trimmed) > CONTRIBUTION_MAX_SUGGESTED_CAPTION_CODE_POINTS) {
    return {
      ok: false,
      message: `建议图注不能超过 ${CONTRIBUTION_MAX_SUGGESTED_CAPTION_CODE_POINTS} 个字`,
    };
  }
  return { ok: true, value: trimmed };
};
