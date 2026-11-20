import { describeApiError } from "../../../apis/shared/describeApiError";

/** 账户页错误文案：已知 reason 用中文，其它走通用描述。 */
export const describeAccountError = (error: unknown): string =>
  describeApiError(error, {
    PASSWORD_INCORRECT: "当前密码不正确。",
    PASSWORD_WEAK: "新密码需为 8–72 个字符。",
    DISPLAY_NAME_INVALID: "显示名需为 1–32 个字。",
    BIO_TOO_LONG: "简介最多 200 个字。",
  });
