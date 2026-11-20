import { describeApiError } from "../../../apis/shared/describeApiError";
import type { ApiErrorReason } from "../../../apis/shared/ApiError";

const AUTH_REASON_MESSAGES: Partial<Record<ApiErrorReason, string>> = {
  USERNAME_TAKEN: "该用户名已被占用，换一个试试",
  USERNAME_INVALID: "用户名需为 3–32 位字母、数字或下划线",
  PASSWORD_WEAK: "密码需为 8–72 位",
};

/** 登录注册页的错误文案：reason 码优先、401 提示凭据错误、其余按后端 message 兜底。 */
export const describeAuthError = (error: unknown): string =>
  describeApiError(error, AUTH_REASON_MESSAGES, "用户名或密码不正确");
