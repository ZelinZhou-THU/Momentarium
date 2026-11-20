import { parseEmptyResponse } from "../../objects/EmptyResponse";
import type { EmptyResponse } from "../../objects/EmptyResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/** 对应后端 RevokeContributorMessage（POST /api/revokecontributor，仅创建者）。 */
export class RevokeContributorAPI {
  constructor(
    readonly exhibitionId: string,
    readonly contributorId: string,
  ) {}

  send(options?: ApiCallOptions): Promise<EmptyResponse> {
    return send(
      {
        routeName: apiName("RevokeContributorAPI"),
        body: { exhibitionId: this.exhibitionId, contributorId: this.contributorId },
      },
      parseEmptyResponse,
      options,
    );
  }
}
