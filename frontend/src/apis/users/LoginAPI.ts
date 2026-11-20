import { parseAuthResponse } from "../../objects/AuthResponse";
import type { AuthResponse } from "../../objects/AuthResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 LoginMessage（POST /api/login）；输入字段即请求体。 */
export class LoginAPI {
  constructor(
    readonly username: string,
    readonly password: string,
  ) {}

  send(): Promise<AuthResponse> {
    return send(
      {
        routeName: apiName("LoginAPI"),
        body: { username: this.username, password: this.password },
      },
      parseAuthResponse,
    );
  }
}
