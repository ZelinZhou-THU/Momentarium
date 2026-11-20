import type {
  AdoptedLocationInput,
  ContributionSummary,
} from "../../../../../objects/gallery/Contribution";
import type { ExhibitionDetail } from "../../../../../objects/gallery/ExhibitionDetail";
import { photoLabel } from "../../../../../objects/gallery/photoLabel";
import type { LocationGranularity, PhotoLocationView } from "../../../../../objects/gallery/PhotoLocationView";
import { isValidLatitude, isValidLongitude } from "../../../../../objects/gallery/GeoPoint";
import type {
  ContributionInviteStatus,
  ContributionParticipantStatus,
} from "../../../../../objects/gallery/ContributionEnums";

/** 审阅列表：submitted 且（未采用 或 已采用版本落后）都需要创建者处理。 */
export const pendingReviewContributions = (
  contributions: readonly ContributionSummary[],
): readonly ContributionSummary[] =>
  contributions.filter(
    (contribution) =>
      contribution.status === "submitted" &&
      (contribution.adoption === null || contribution.hasPendingUpdate),
  );

/** 未被采用（declined）分区：等投稿者修改后重新提交。 */
export const declinedContributions = (
  contributions: readonly ContributionSummary[],
): readonly ContributionSummary[] =>
  contributions.filter((contribution) => contribution.status === "declined");

/** 已撤回分区。 */
export const withdrawnContributions = (
  contributions: readonly ContributionSummary[],
): readonly ContributionSummary[] =>
  contributions.filter((contribution) => contribution.status === "withdrawn");

/** 其余（已采用且无待确认更新等）。 */
export const otherContributions = (
  contributions: readonly ContributionSummary[],
): readonly ContributionSummary[] => {
  const pendingIds = new Set([
    ...pendingReviewContributions(contributions).map((contribution) => contribution.id),
    ...declinedContributions(contributions).map((contribution) => contribution.id),
    ...withdrawnContributions(contributions).map((contribution) => contribution.id),
  ]);
  return contributions.filter((contribution) => !pendingIds.has(contribution.id));
};

export const describeReviewStatus = (contribution: ContributionSummary): string => {
  if (contribution.adoption === null) {
    return "待审";
  }
  return contribution.hasPendingUpdate ? "待确认更新" : "已采用";
};

export const describeInviteStatusLabel = (status: ContributionInviteStatus): string =>
  status === "active" ? "有效" : "已关闭";

export const describeParticipantStatusLabel = (status: ContributionParticipantStatus): string =>
  status === "active" ? "参与中" : "已撤销";

export interface AdoptedMemoryRow {
  readonly photoId: string;
  /** 照片的统一称呼（图注 → 原文件名），与其他分区一致。 */
  readonly photoLabel: string;
  readonly caption: string;
  readonly location: PhotoLocationView | null;
  readonly thumbUrl: string;
  readonly contentUrl: string;
  readonly memoryId: string;
  readonly text: string;
  readonly contributorName: string;
}

/** 从草稿详情收集已采用的讲述（用于“已采用记忆可移除”），按章节顺序再接未分组照片。 */
export const collectAdoptedMemories = (detail: ExhibitionDetail): readonly AdoptedMemoryRow[] =>
  [...detail.groups.flatMap((group) => group.photos), ...detail.ungroupedPhotos].flatMap((photo) =>
    photo.memories.map((memory) => ({
      photoId: photo.id,
      photoLabel: photoLabel(photo),
      caption: photo.caption,
      location: detail.locations.find((location) => location.photoId === photo.id) ?? null,
      thumbUrl: photo.thumbUrl,
      contentUrl: photo.contentUrl,
      memoryId: memory.memoryId,
      text: memory.text,
      contributorName: memory.contributorName,
    })),
  );

/**
 * 已采用的内容快照：待确认更新时，用来和投稿者的最新版本并排对照。
 * 讲述原文与照片都已经在草稿详情里（photo_memories / 草稿照片），不需要额外接口。
 */
export interface AdoptedSnapshot {
  readonly version: number;
  readonly text: string;
  readonly photoLabel: string;
  readonly caption: string;
  readonly location: PhotoLocationView | null;
  readonly thumbUrl: string;
  readonly contentUrl: string;
}

/** 按投稿的采用关系（memoryId）在草稿讲述里找到已采用的那一版；没有采用或讲述已被移除时为 null。 */
export const findAdoptedSnapshot = (
  contribution: ContributionSummary,
  adoptedMemories: readonly AdoptedMemoryRow[],
): AdoptedSnapshot | null => {
  const adoption = contribution.adoption;
  if (adoption === null) {
    return null;
  }
  const row = adoptedMemories.find((memory) => memory.memoryId === adoption.memoryId);
  return row === undefined
    ? null
    : {
        version: adoption.adoptedVersion,
        text: row.text,
        photoLabel: row.photoLabel,
        caption: row.caption,
        location: row.location,
        thumbUrl: row.thumbUrl,
        contentUrl: row.contentUrl,
      };
};

/** 最新讲述相对已采用讲述的变化，给审阅者一个一眼能读的结论。 */
export const describeMemoryTextChange = (adoptedText: string, latestText: string): string =>
  adoptedText.trim() === latestText.trim() ? "讲述文字没有变化（可能改了照片或位置）" : "讲述文字有修改";

/** 采用表单里需要校验的文字字段：图注与位置。 */
export interface AdoptionFormFields {
  /** 显式提交的图注（可空串；预填建议图注，清空表示空图注）。 */
  readonly caption: string;
  readonly location: AdoptedLocationInput | null;
}

/**
 * v1.12 采用只剩「收进草稿」：把投稿照片与讲述收进草稿的新照片，不再有目标照片选择。
 * v1.15：可选 groupId，首次采用时把新照片放进该章节末尾；null 落入未分组。
 */
export interface AdoptionFormValues extends AdoptionFormFields {
  readonly groupId: string | null;
}

export type AdoptionValidation =
  | { readonly ok: true; readonly values: AdoptionFormFields }
  | { readonly ok: false; readonly message: string };

/** 采用对话框章节下拉的选项（只需要 id 与标题）。 */
export interface AdoptionGroupOption {
  readonly id: string;
  readonly title: string;
}

/** 默认放进最后一章（新照片天然追加在策展末尾）；展览还没有章节时为 null（落入未分组）。 */
export const defaultAdoptionGroupId = (groups: readonly AdoptionGroupOption[]): string | null =>
  groups.at(-1)?.id ?? null;

/** 章节下拉里的显示名：标题为空时按序号称呼。 */
export const describeAdoptionGroup = (group: AdoptionGroupOption, index: number): string =>
  group.title.trim().length > 0 ? group.title.trim() : `章节 ${index + 1}`;

const coordinateOrNull = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * 采用表单校验（只剩新照片）：图注 0–120 码点且不含控制字符，空串允许；
 * 位置可整体留空；填了名称/坐标时坐标必须成对合法；粒度始终随位置提交。
 */
export const validateAdoptionForm = (
  caption: string,
  locationName: string,
  latitudeText: string,
  longitudeText: string,
  granularity: LocationGranularity,
): AdoptionValidation => {
  const captionValue = caption.trim();
  if (/[\u0000-\u001F\u007F]/u.test(captionValue)) {
    return { ok: false, message: "图注不能包含换行或控制字符" };
  }
  if ([...captionValue].length > 120) {
    return { ok: false, message: "图注不能超过 120 个字" };
  }

  const name = locationName.trim();
  const latitude = coordinateOrNull(latitudeText);
  const longitude = coordinateOrNull(longitudeText);
  const hasLatitude = latitudeText.trim() !== "";
  const hasLongitude = longitudeText.trim() !== "";
  if (hasLatitude !== hasLongitude) {
    return { ok: false, message: "经纬度必须成对填写（或都留空）" };
  }

  let location: AdoptedLocationInput | null = null;
  if (name.length > 0 || hasLatitude) {
    if (name.length === 0) {
      return { ok: false, message: "填写坐标时请同时填写地点名称" };
    }
    if (hasLatitude && (latitude === null || !isValidLatitude(latitude))) {
      return { ok: false, message: "纬度无效：需为 -90 到 90 之间的数字" };
    }
    if (hasLongitude && (longitude === null || !isValidLongitude(longitude))) {
      return { ok: false, message: "经度无效：需为 -180 到 180 之间的数字" };
    }
    if (granularity !== "hidden" && (latitude === null || longitude === null)) {
      return { ok: false, message: "公开范围/精确点需要填写经纬度（或改为不公开）" };
    }
    location = { name, latitude, longitude, granularity };
  }

  return {
    ok: true,
    values: {
      // v1.12：采用固定新建草稿照片，图注显式提交（清空传空串）。
      caption: captionValue,
      location,
    },
  };
};

/** 移除已采用讲述的二次确认：不假装知道目标照片是否由该投稿新建（DTO 无 target kind）。 */
export const REMOVE_MEMORY_CONFIRM_MESSAGE =
  "只会移除这段讲述。若这张照片由这条投稿新建且没有其他讲述，会一并从草稿移除或归档；已发布版本不会改变。";

/** 邀请链接：只在浏览器环境拼 origin；SSR/测试回退相对路径。 */
export const inviteUrl = (token: string): string => {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/invite/${encodeURIComponent(token)}`;
};
