import {
  requireNullable,
  requireObject,
  requireOneOf,
  requireString,
} from "../../apis/shared/decode";
import {
  CONTRIBUTION_INVITE_STATUSES,
  CONTRIBUTION_PARTICIPANT_STATUSES,
} from "./ContributionEnums";
import type { ContributionInviteStatus, ContributionParticipantStatus } from "./ContributionEnums";

/** 契约 v1.9 CreateContributionInvite 响应：token 只在这里返回一次明文。 */
export interface ContributionInviteCreated {
  readonly inviteId: string;
  readonly token: string;
  readonly createdAt: string;
}

export const parseContributionInviteCreated = (
  value: unknown,
  path = "contributionInviteCreated",
): ContributionInviteCreated => {
  const record = requireObject(value, path);
  return {
    inviteId: requireString(record.inviteId, `${path}.inviteId`),
    token: requireString(record.token, `${path}.token`),
    createdAt: requireString(record.createdAt, `${path}.createdAt`),
  };
};

/** 契约 v1.9 ContributionInviteSummary：管理工作台的邀请链接状态（不含 token）。 */
export interface ContributionInviteSummary {
  readonly id: string;
  readonly status: ContributionInviteStatus;
  readonly createdAt: string;
  readonly closedAt: string | null;
}

export const parseContributionInviteSummary = (
  value: unknown,
  path = "contributionInvite",
): ContributionInviteSummary => {
  const record = requireObject(value, path);
  return {
    id: requireString(record.id, `${path}.id`),
    status: requireOneOf(record.status, CONTRIBUTION_INVITE_STATUSES, `${path}.status`),
    createdAt: requireString(record.createdAt, `${path}.createdAt`),
    closedAt: requireNullable(record.closedAt, `${path}.closedAt`, requireString),
  };
};

/** 契约 v1.9 ContributionInvitePreview：公开邀请页只拿标题、邀请人展示名（v1.17）与状态，不泄露私有内容。 */
export interface ContributionInvitePreview {
  readonly exhibitionTitle: string;
  readonly inviterName: string;
  readonly status: ContributionInviteStatus;
}

export const parseContributionInvitePreview = (
  value: unknown,
  path = "contributionInvitePreview",
): ContributionInvitePreview => {
  const record = requireObject(value, path);
  return {
    exhibitionTitle: requireString(record.exhibitionTitle, `${path}.exhibitionTitle`),
    inviterName: requireString(record.inviterName, `${path}.inviterName`),
    status: requireOneOf(record.status, CONTRIBUTION_INVITE_STATUSES, `${path}.status`),
  };
};

/** 契约 v1.9 ContributionMembershipView：兑换加入后的参与关系（可重复调用且幂等）。 */
export interface ContributionMembershipView {
  readonly exhibitionId: string;
  readonly exhibitionTitle: string;
  readonly status: ContributionParticipantStatus;
  readonly joinedAt: string;
}

export const parseContributionMembershipView = (
  value: unknown,
  path = "contributionMembership",
): ContributionMembershipView => {
  const record = requireObject(value, path);
  return {
    exhibitionId: requireString(record.exhibitionId, `${path}.exhibitionId`),
    exhibitionTitle: requireString(record.exhibitionTitle, `${path}.exhibitionTitle`),
    status: requireOneOf(record.status, CONTRIBUTION_PARTICIPANT_STATUSES, `${path}.status`),
    joinedAt: requireString(record.joinedAt, `${path}.joinedAt`),
  };
};
