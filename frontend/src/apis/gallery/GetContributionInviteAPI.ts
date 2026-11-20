import { parseContributionInvitePreview } from "../../objects/gallery/ContributionInvite";
import type { ContributionInvitePreview } from "../../objects/gallery/ContributionInvite";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/** 对应后端 GetContributionInviteMessage（POST /api/getcontributioninvite，公开、无令牌）。 */
export class GetContributionInviteAPI {
  constructor(readonly token: string) {}

  send(options?: ApiCallOptions): Promise<ContributionInvitePreview> {
    return send(
      { routeName: apiName("GetContributionInviteAPI"), body: { token: this.token } },
      parseContributionInvitePreview,
      { ...options, authentication: "none" },
    );
  }
}
