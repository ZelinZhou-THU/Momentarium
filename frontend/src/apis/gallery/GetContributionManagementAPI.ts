import { parseContributionManagementResponse } from "../../objects/gallery/ContributionManagement";
import type { ContributionManagementResponse } from "../../objects/gallery/ContributionManagement";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/** 对应后端 GetContributionManagementMessage（POST /api/getcontributionmanagement，仅创建者）。 */
export class GetContributionManagementAPI {
  constructor(readonly exhibitionId: string) {}

  send(options?: ApiCallOptions): Promise<ContributionManagementResponse> {
    return send(
      {
        routeName: apiName("GetContributionManagementAPI"),
        body: { exhibitionId: this.exhibitionId },
      },
      parseContributionManagementResponse,
      options,
    );
  }
}
