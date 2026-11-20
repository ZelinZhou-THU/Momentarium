import { parseAuthResponse } from "../../objects/AuthResponse";
import type { AuthResponse } from "../../objects/AuthResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 ChangePasswordMessage（POST /api/changepassword）：成功返回新令牌，旧令牌全部失效。 */
export class ChangePasswordAPI {
  constructor(
    readonly currentPassword: string,
    readonly newPassword: string,
  ) {}

  send(): Promise<AuthResponse> {
    return send(
      {
        routeName: apiName("ChangePasswordAPI"),
        body: { currentPassword: this.currentPassword, newPassword: this.newPassword },
      },
      parseAuthResponse,
    );
  }
}
