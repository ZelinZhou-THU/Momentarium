import { describeApiError } from "../shared/describeApiError";
import type { ApiErrorReason } from "../shared/ApiError";

const GALLERY_REASON_MESSAGES: Partial<Record<ApiErrorReason, string>> = {
  INVALID_COVER: "封面无效，请重新选择",
  COVER_TOO_LARGE: "封面图片过大，请重试",
  COVER_UNSUPPORTED_TYPE: "封面图片格式不支持",
  TITLE_REQUIRED: "请填写展览标题",
  PHOTO_COUNT: "展览至少需要 3 张照片",
  PHOTO_UNGROUPED: "还有照片没有放入章节",
  GROUP_EMPTY: "存在空章节，请放入照片或删除章节",
  SCENE_NOT_READY: "需要一个生成成功的三维场景才能发布",
  SCENE_STALE: "场景已过期，请重新生成后再发布",
  VERSION_CONFLICT: "内容已在别处更新，请刷新后重试",
  LOCATION_NAME_INVALID: "请填写地点名称（1–120 个字）",
  LOCATION_COORDINATES_INVALID: "坐标无效：请重新在地图上选点，或填写合法的成对经纬度",
  LOCATION_GRANULARITY_INVALID: "公开范围与坐标不匹配：公开范围或精确点必须有坐标",
  PLACE_QUERY_INVALID: "请输入要搜索的地点名称（1–200 个字）",
  PLACE_SEARCH_UNAVAILABLE: "地点搜索服务暂时不可用，可稍后重试或直接在地图上选点",
};

/** gallery 页面（列表/工作台/发布）的错误文案：reason 码优先，其余按后端 message 兜底。 */
export const describeGalleryError = (error: unknown): string =>
  describeApiError(error, GALLERY_REASON_MESSAGES, "登录状态已失效，请重新登录");
