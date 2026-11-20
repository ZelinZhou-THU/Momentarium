import {
  requireArray,
  requireOneOf,
  requireObject,
  requireString,
} from "../../apis/shared/decode";
import { CONTRIBUTION_UPLOAD_FAILURE_REASONS } from "./ContributionEnums";
import type { ContributionUploadFailureReason } from "./ContributionEnums";
import { parseContributionSummary } from "./Contribution";
import type { ContributionSummary } from "./Contribution";

/** 契约 v1.9 ContributionUploadFailure：逐文件失败只出现在 200 响应的 failures[]。 */
export interface ContributionUploadFailure {
  readonly fileName: string;
  readonly reason: ContributionUploadFailureReason;
}

/** 契约 v1.9 ContributionUploadResponse：multipart 创建/替换文件后的投稿列表。 */
export interface ContributionUploadResponse {
  readonly contributions: readonly ContributionSummary[];
  readonly failures: readonly ContributionUploadFailure[];
}

export const parseContributionUploadResponse = (
  value: unknown,
  path = "contributionUpload",
): ContributionUploadResponse => {
  const record = requireObject(value, path);
  return {
    contributions: requireArray(record.contributions, `${path}.contributions`).map(
      (contribution, index) => parseContributionSummary(contribution, `${path}.contributions[${index}]`),
    ),
    failures: requireArray(record.failures, `${path}.failures`).map((failure, index) => {
      const failureRecord = requireObject(failure, `${path}.failures[${index}]`);
      return {
        fileName: requireString(failureRecord.fileName, `${path}.failures[${index}].fileName`),
        reason: requireOneOf(
          failureRecord.reason,
          CONTRIBUTION_UPLOAD_FAILURE_REASONS,
          `${path}.failures[${index}].reason`,
        ),
      };
    }),
  };
};
