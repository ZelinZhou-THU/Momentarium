import { parseEmptyResponse } from "../../objects/EmptyResponse";
import type { EmptyResponse } from "../../objects/EmptyResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 LogoutMessage（POST /api/logout，无请求消息，令牌必带）。 */
export class LogoutAPI {
  send(): Promise<EmptyResponse> {
    return send({ routeName: apiName("LogoutAPI") }, parseEmptyResponse);
  }
}
