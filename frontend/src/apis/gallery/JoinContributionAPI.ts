import { parseContributionMembershipView } from "../../objects/gallery/ContributionInvite";
import type { ContributionMembershipView } from "../../objects/gallery/ContributionInvite";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/** 对应后端 JoinContributionMessage（POST /api/joincontribution，需登录；重复调用幂等）。 */
export class JoinContributionAPI {
  constructor(readonly token: string) {}

  send(options?: ApiCallOptions): Promise<ContributionMembershipView> {
    return send(
      { routeName: apiName("JoinContributionAPI"), body: { token: this.token } },
      parseContributionMembershipView,
      options,
    );
  }
}
