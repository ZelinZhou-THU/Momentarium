import { describeApiError } from "../shared/describeApiError";
import type { ApiErrorReason } from "../shared/ApiError";

const PLACE_SEARCH_REASON_MESSAGES: Partial<Record<ApiErrorReason, string>> = {
  PLACE_QUERY_INVALID: "请输入要搜索的地点名称（1–200 个字）",
  PLACE_SEARCH_UNAVAILABLE: "地点搜索服务暂时不可用，可稍后重试或直接在地图上选点",
};

/** 地点搜索错误文案（作者地图分区与投稿者编辑器共用）：reason 码优先，其余交给统一错误描述。 */
export const describePlaceSearchError = (error: unknown): string =>
  describeApiError(error, PLACE_SEARCH_REASON_MESSAGES, "登录状态已失效，请重新登录");
