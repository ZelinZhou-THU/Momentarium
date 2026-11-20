import {
  requireArray,
  requireBoolean,
  requireNullable,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from "../../apis/shared/decode";
import type { LocationGranularity } from "./PhotoLocationView";
import {
  CONTRIBUTION_LOCATION_SOURCES,
  CONTRIBUTION_STATUSES,
} from "./ContributionEnums";
import type { ContributionLocationSource, ContributionStatus } from "./ContributionEnums";

/** 契约 v1.9 ContributorBrief：投稿摘要里的作者标识（列表按角色过滤后共用）。 */
export interface ContributorBrief {
  readonly contributorId: string;
  readonly username: string;
  readonly displayName: string;
}

export const parseContributorBrief = (value: unknown, path = "contributor"): ContributorBrief => {
  const record = requireObject(value, path);
  return {
    contributorId: requireString(record.contributorId, `${path}.contributorId`),
    username: requireString(record.username, `${path}.username`),
    displayName: requireString(record.displayName, `${path}.displayName`),
  };
};

/** 契约 v1.9 ContributionLocationView：投稿者建议的位置（suggested；公开粒度在采用时确认）。 */
export interface ContributionLocationView {
  readonly name: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly source: ContributionLocationSource;
}

export const parseContributionLocationView = (
  value: unknown,
  path = "contributionLocation",
): ContributionLocationView => {
  const record = requireObject(value, path);
  return {
    name: requireString(record.name, `${path}.name`),
    latitude: requireNullable(record.latitude, `${path}.latitude`, requireNumber),
    longitude: requireNullable(record.longitude, `${path}.longitude`, requireNumber),
    source: requireOneOf(record.source, CONTRIBUTION_LOCATION_SOURCES, `${path}.source`),
  };
};

/** 投稿者补/改位置时的请求字段（无公开粒度；采用时由创建者确认）。 */
export interface ContributionLocationInput {
  readonly name: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/** 创建者采用时确认的位置与公开粒度。 */
export interface AdoptedLocationInput {
  readonly name: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly granularity: LocationGranularity;
}

export interface ContributionFileView {
  readonly mime: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly contentUrl: string;
  readonly thumbUrl: string;
}

const parseContributionFileView = (value: unknown, path: string): ContributionFileView => {
  const record = requireObject(value, path);
  return {
    mime: requireString(record.mime, `${path}.mime`),
    width: requireNullable(record.width, `${path}.width`, requireNumber),
    height: requireNullable(record.height, `${path}.height`, requireNumber),
    contentUrl: requireString(record.contentUrl, `${path}.contentUrl`),
    thumbUrl: requireString(record.thumbUrl, `${path}.thumbUrl`),
  };
};

/** 契约 v1.9 ContributionAdoptionView：某投稿在某版本被采用到哪张照片/哪条记忆。 */
export interface ContributionAdoptionView {
  readonly contributionId: string;
  readonly photoId: string;
  readonly memoryId: string;
  readonly adoptedVersion: number;
}

export const parseContributionAdoptionView = (
  value: unknown,
  path = "contributionAdoption",
): ContributionAdoptionView => {
  const record = requireObject(value, path);
  return {
    contributionId: requireString(record.contributionId, `${path}.contributionId`),
    photoId: requireString(record.photoId, `${path}.photoId`),
    memoryId: requireString(record.memoryId, `${path}.memoryId`),
    adoptedVersion: requireNumber(record.adoptedVersion, `${path}.adoptedVersion`),
  };
};

/**
 * 契约 v1.9 ContributionSummary（“我的投稿”与创建者审阅列表共用）：
 * `adoption` 为 null 表示尚未采用；`hasPendingUpdate` 表示投稿版本比已采用版本新。
 */
export interface ContributionSummary {
  readonly id: string;
  readonly exhibitionId: string;
  readonly exhibitionTitle: string;
  readonly contributor: ContributorBrief;
  readonly status: ContributionStatus;
  readonly version: number;
  readonly memoryText: string;
  /** v1.11：投稿者给策展人的建议图注（可选，≤120 字）；旧响应没有该字段时按 null 兼容。 */
  readonly suggestedCaption: string | null;
  readonly location: ContributionLocationView | null;
  /** v1.10：一条回忆最多 1 张照片；纯文字回忆为 null。 */
  readonly file: ContributionFileView | null;
  readonly adoption: ContributionAdoptionView | null;
  readonly hasPendingUpdate: boolean;
  /** v1.16：该展览当前有生效的发布版本（投稿者据此给出「查看公开展览」）。 */
  readonly exhibitionPublished: boolean;
  /** v1.16：已采用的讲述已经出现在当前发布版本里（采用发生在发布之后则为 false）。 */
  readonly memoryPublished: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly withdrawnAt: string | null;
}

export const parseContributionSummary = (
  value: unknown,
  path = "contribution",
): ContributionSummary => {
  const record = requireObject(value, path);
  return {
    id: requireString(record.id, `${path}.id`),
    exhibitionId: requireString(record.exhibitionId, `${path}.exhibitionId`),
    exhibitionTitle: requireString(record.exhibitionTitle, `${path}.exhibitionTitle`),
    contributor: parseContributorBrief(record.contributor, `${path}.contributor`),
    status: requireOneOf(record.status, CONTRIBUTION_STATUSES, `${path}.status`),
    version: requireNumber(record.version, `${path}.version`),
    memoryText: requireString(record.memoryText, `${path}.memoryText`),
    suggestedCaption:
      record.suggestedCaption === undefined
        ? null
        : requireNullable(record.suggestedCaption, `${path}.suggestedCaption`, requireString),
    location: requireNullable(
      record.location,
      `${path}.location`,
      parseContributionLocationView,
    ),
    file: requireNullable(record.file, `${path}.file`, parseContributionFileView),
    adoption: requireNullable(
      record.adoption,
      `${path}.adoption`,
      parseContributionAdoptionView,
    ),
    hasPendingUpdate: requireBoolean(record.hasPendingUpdate, `${path}.hasPendingUpdate`),
    exhibitionPublished: requireBoolean(record.exhibitionPublished, `${path}.exhibitionPublished`),
    memoryPublished: requireBoolean(record.memoryPublished, `${path}.memoryPublished`),
    createdAt: requireString(record.createdAt, `${path}.createdAt`),
    updatedAt: requireString(record.updatedAt, `${path}.updatedAt`),
    withdrawnAt: requireNullable(record.withdrawnAt, `${path}.withdrawnAt`, requireString),
  };
};

/** 契约 v1.9 ContributionsResponse：列表即详情，不另设投稿详情路由。 */
export interface ContributionsResponse {
  readonly contributions: readonly ContributionSummary[];
}

export const parseContributionsResponse = (
  value: unknown,
  path = "contributionsResponse",
): ContributionsResponse => {
  const record = requireObject(value, path);
  return {
    contributions: requireArray(record.contributions, `${path}.contributions`).map(
      (contribution, index) => parseContributionSummary(contribution, `${path}.contributions[${index}]`),
    ),
  };
};
