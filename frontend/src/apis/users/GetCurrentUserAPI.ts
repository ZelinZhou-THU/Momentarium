import { parseUserView } from "../../objects/UserView";
import type { UserView } from "../../objects/UserView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 GetCurrentUserMessage（POST /api/getcurrentuser，无请求消息，令牌必带）。 */
export class GetCurrentUserAPI {
  send(): Promise<UserView> {
    return send({ routeName: apiName("GetCurrentUserAPI") }, parseUserView);
  }
}
