import { requireObject, requireString } from "../apis/shared/decode";
import { parseUserView } from "./UserView";
import type { UserView } from "./UserView";

/** 契约 §1.1 AuthResponse(token, user: UserView)；register/login 的响应。 */
export interface AuthResponse {
  readonly token: string;
  readonly user: UserView;
}

export const parseAuthResponse = (value: unknown): AuthResponse => {
  const record = requireObject(value, "auth");
  return {
    token: requireString(record.token, "auth.token"),
    user: parseUserView(record.user),
  };
};
