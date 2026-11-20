import { ApiError, NetworkError } from "../shared/ApiError";
import type { ApiErrorReason } from "../shared/ApiError";
import { DecodeError } from "../shared/decode";
import { describeApiError } from "../shared/describeApiError";

const CURATION_REASON_MESSAGES: Partial<Record<ApiErrorReason, string>> = {
  TITLE_REQUIRED: "请填写展览标题",
  PHOTO_COUNT: "至少需要 3 张照片才能保存策展",
  PHOTO_UNGROUPED: "还有照片没有放入章节",
  GROUP_EMPTY: "存在空章节，请放入照片或删除章节",
};

/** curation 区域的错误文案：reason 优先；模型失败给可重试提示；其余按后端 message 兜底。 */
export const describeCurationError = (error: unknown): string => {
  if (error instanceof ApiError && error.code === "MODEL_FAILURE") {
    return "AI 生成失败，请稍后重试";
  }
  if (error instanceof DecodeError) {
    return "服务返回的数据异常，请稍后重试";
  }
  if (error instanceof NetworkError) {
    return error.message;
  }
  return describeApiError(error, CURATION_REASON_MESSAGES, "登录状态已失效，请重新登录");
};
