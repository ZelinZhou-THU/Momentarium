import { parseContributionInviteSummary } from "../../objects/gallery/ContributionInvite";
import type { ContributionInviteSummary } from "../../objects/gallery/ContributionInvite";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/** 对应后端 CloseContributionInviteMessage（POST /api/closecontributioninvite，仅创建者）。 */
export class CloseContributionInviteAPI {
  constructor(
    readonly exhibitionId: string,
    readonly inviteId: string,
  ) {}

  send(options?: ApiCallOptions): Promise<ContributionInviteSummary> {
    return send(
      {
        routeName: apiName("CloseContributionInviteAPI"),
        body: { exhibitionId: this.exhibitionId, inviteId: this.inviteId },
      },
      parseContributionInviteSummary,
      options,
    );
  }
}
