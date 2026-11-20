import { parseProfileView } from "../../objects/ProfileView";
import type { ProfileView } from "../../objects/ProfileView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 UpdateMyProfileMessage（POST /api/updatemyprofile）：整体替换公开资料。 */
export class UpdateMyProfileAPI {
  constructor(
    readonly displayName: string,
    readonly bio: string,
    readonly homepagePublic: boolean,
  ) {}

  send(): Promise<ProfileView> {
    return send(
      {
        routeName: apiName("UpdateMyProfileAPI"),
        body: { displayName: this.displayName, bio: this.bio, homepagePublic: this.homepagePublic },
      },
      parseProfileView,
    );
  }
}
