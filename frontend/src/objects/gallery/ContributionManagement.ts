import {
  requireArray,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from "../../apis/shared/decode";
import { CONTRIBUTION_PARTICIPANT_STATUSES } from "./ContributionEnums";
import type { ContributionParticipantStatus } from "./ContributionEnums";
import { parseContributionInviteSummary } from "./ContributionInvite";
import type { ContributionInviteSummary } from "./ContributionInvite";

/** 契约 v1.9 ContributorView：邀请管理里的参与者（含投稿数）。 */
export interface ContributorView {
  readonly contributorId: string;
  readonly username: string;
  readonly displayName: string;
  readonly status: ContributionParticipantStatus;
  readonly joinedAt: string;
  readonly contributionCount: number;
}

const parseContributorView = (value: unknown, path: string): ContributorView => {
  const record = requireObject(value, path);
  return {
    contributorId: requireString(record.contributorId, `${path}.contributorId`),
    username: requireString(record.username, `${path}.username`),
    displayName: requireString(record.displayName, `${path}.displayName`),
    status: requireOneOf(record.status, CONTRIBUTION_PARTICIPANT_STATUSES, `${path}.status`),
    joinedAt: requireString(record.joinedAt, `${path}.joinedAt`),
    contributionCount: requireNumber(record.contributionCount, `${path}.contributionCount`),
  };
};

/** 契约 v1.9 ContributionManagementResponse：工作台「投稿」分区的邀请 + 参与者读模型。 */
export interface ContributionManagementResponse {
  readonly invites: readonly ContributionInviteSummary[];
  readonly participants: readonly ContributorView[];
}

export const parseContributionManagementResponse = (
  value: unknown,
  path = "contributionManagement",
): ContributionManagementResponse => {
  const record = requireObject(value, path);
  return {
    invites: requireArray(record.invites, `${path}.invites`).map((invite, index) =>
      parseContributionInviteSummary(invite, `${path}.invites[${index}]`),
    ),
    participants: requireArray(record.participants, `${path}.participants`).map(
      (participant, index) => parseContributorView(participant, `${path}.participants[${index}]`),
    ),
  };
};
