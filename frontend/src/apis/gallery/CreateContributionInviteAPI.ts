import { parseContributionInviteCreated } from "../../objects/gallery/ContributionInvite";
import type { ContributionInviteCreated } from "../../objects/gallery/ContributionInvite";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/** 对应后端 CreateContributionInviteMessage（POST /api/createcontributioninvite）。 */
export class CreateContributionInviteAPI {
  constructor(readonly exhibitionId: string) {}

  send(options?: ApiCallOptions): Promise<ContributionInviteCreated> {
    return send(
      { routeName: apiName("CreateContributionInviteAPI"), body: { exhibitionId: this.exhibitionId } },
      parseContributionInviteCreated,
      options,
    );
  }
}
