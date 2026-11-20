import { ApiError, NetworkError } from "./ApiError";
import type { ApiErrorReason } from "./ApiError";
import { DecodeError } from "./decode";

const FALLBACK_MESSAGE = "请求失败，请稍后重试";

/**
 * 契约错误 → 可展示中文提示的统一入口：优先业务 reason 映射，其次 401 兜底文案，
 * 再退回后端 message；网络/解码错误使用固定文案。各页面只提供自己的 reason 文案表。
 */
export const describeApiError = (
  error: unknown,
  reasonMessages: Partial<Record<ApiErrorReason, string>>,
  unauthorizedMessage?: string,
): string => {
  if (error instanceof ApiError) {
    const reasonMessage = error.reason === null ? undefined : reasonMessages[error.reason];
    if (reasonMessage !== undefined) {
      return reasonMessage;
    }
    if (error.code === "UNAUTHORIZED" && unauthorizedMessage !== undefined) {
      return unauthorizedMessage;
    }
    return error.message;
  }

  if (error instanceof DecodeError) {
    return "服务返回的数据异常，请稍后重试";
  }

  if (error instanceof NetworkError) {
    return error.message;
  }

  return FALLBACK_MESSAGE;
};
