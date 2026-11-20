import { parseContributionSummary } from "../../objects/gallery/Contribution";
import type { ContributionSummary } from "../../objects/gallery/Contribution";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 DeclineContributionMessage（POST /api/declinecontribution，仅创建者）。
 * 拒绝一条已提交且未被采用的回忆（status → declined，可修改后重新提交），返回更新后的摘要；
 * 已采用返回 409 CONTRIBUTION_ALREADY_ADOPTED，已撤回 409 CONTRIBUTION_WITHDRAWN，
 * 版本不符 409 CONTRIBUTION_VERSION_CONFLICT，同版本重复拒绝幂等。
 */
export class DeclineContributionAPI {
  constructor(
    readonly contributionId: string,
    readonly expectedVersion: number,
  ) {}

  send(options?: ApiCallOptions): Promise<ContributionSummary> {
    return send(
      {
        routeName: apiName("DeclineContributionAPI"),
        body: { contributionId: this.contributionId, expectedVersion: this.expectedVersion },
      },
      parseContributionSummary,
      options,
    );
  }
}
