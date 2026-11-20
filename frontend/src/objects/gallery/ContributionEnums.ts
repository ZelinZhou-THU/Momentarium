/** 契约 v1.10 共同投稿的封闭枚举值：解析器、契约测试与页面分支共用同一份定义。 */
export type ContributionStatus = "draft" | "submitted" | "declined" | "withdrawn";
export type ContributionParticipantStatus = "active" | "revoked";
export type ContributionInviteStatus = "active" | "closed";
export type ContributionUploadFailureReason = "UPLOAD_TOO_LARGE" | "UPLOAD_UNSUPPORTED_TYPE";
export type ContributionLocationSource = "exif" | "manual";

export const CONTRIBUTION_STATUSES: readonly ContributionStatus[] = [
  "draft",
  "submitted",
  "declined",
  "withdrawn",
];

export const CONTRIBUTION_PARTICIPANT_STATUSES: readonly ContributionParticipantStatus[] = [
  "active",
  "revoked",
];

export const CONTRIBUTION_INVITE_STATUSES: readonly ContributionInviteStatus[] = ["active", "closed"];

export const CONTRIBUTION_UPLOAD_FAILURE_REASONS: readonly ContributionUploadFailureReason[] = [
  "UPLOAD_TOO_LARGE",
  "UPLOAD_UNSUPPORTED_TYPE",
];

export const CONTRIBUTION_LOCATION_SOURCES: readonly ContributionLocationSource[] = [
  "exif",
  "manual",
];
