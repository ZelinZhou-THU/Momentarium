import { parseEmptyResponse } from "../../objects/EmptyResponse";
import type { EmptyResponse } from "../../objects/EmptyResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/** 对应后端 WithdrawContributionMessage（POST /api/withdrawcontribution，仅投稿者本人）。 */
export class WithdrawContributionAPI {
  constructor(readonly contributionId: string) {}

  send(options?: ApiCallOptions): Promise<EmptyResponse> {
    return send(
      {
        routeName: apiName("WithdrawContributionAPI"),
        body: { contributionId: this.contributionId },
      },
      parseEmptyResponse,
      options,
    );
  }
}
