import { parseProfileView } from "../../objects/ProfileView";
import type { ProfileView } from "../../objects/ProfileView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 GetMyProfileMessage（POST /api/getmyprofile，无请求消息）。 */
export class GetMyProfileAPI {
  send(): Promise<ProfileView> {
    return send({ routeName: apiName("GetMyProfileAPI") }, parseProfileView);
  }
}
