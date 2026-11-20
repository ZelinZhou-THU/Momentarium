import { isRecord } from "./decode";

/** 契约 §0.1 错误码（固定集合；类型由运行时白名单推导，避免两份清单漂移）。 */
const API_ERROR_CODES = [
  "BAD_REQUEST",
  "VALIDATION",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "MODEL_FAILURE",
  "GENERATION_FAILED",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** 契约 §0.2 reason 码（固定集合；前端按键值分支处理，禁止匹配 message 文本）。 */
const API_ERROR_REASONS = [
  "TITLE_REQUIRED",
  "PHOTO_COUNT",
  "PHOTO_UNGROUPED",
  "GROUP_EMPTY",
  "SCENE_NOT_READY",
  "SCENE_STALE",
  "PHOTO_LIMIT",
  "UPLOAD_TOO_LARGE",
  "UPLOAD_UNSUPPORTED_TYPE",
  "INVALID_COVER",
  "COVER_TOO_LARGE",
  "COVER_UNSUPPORTED_TYPE",
  "USERNAME_INVALID",
  "PASSWORD_WEAK",
  "SCENE_RUN_NOT_RESTORABLE",
  "DISPLAY_NAME_INVALID",
  "BIO_TOO_LONG",
  "PASSWORD_INCORRECT",
  "SCENE_RUN_ACTIVE",
  "USERNAME_TAKEN",
  "VERSION_CONFLICT",
  "LOCATION_NAME_INVALID",
  "LOCATION_COORDINATES_INVALID",
  "LOCATION_GRANULARITY_INVALID",
  "PLACE_QUERY_INVALID",
  "PLACE_SEARCH_UNAVAILABLE",
  "CONTRIBUTION_MEMORY_INVALID",
  "CONTRIBUTION_BATCH_LIMIT",
  "CONTRIBUTION_QUOTA_PHOTOS",
  "CONTRIBUTION_QUOTA_BYTES",
  "CONTRIBUTION_SELF_NOT_ALLOWED",
  "INVITE_CLOSED",
  "PARTICIPANT_REVOKED",
  "CONTRIBUTION_WITHDRAWN",
  "CONTRIBUTION_VERSION_CONFLICT",
  "CONTRIBUTION_TARGET_CONFLICT",
  "CONTRIBUTION_PHOTO_REQUIRED",
  "CONTRIBUTION_ALREADY_ADOPTED",
  "CONTRIBUTION_DECLINED",
  "CONTRIBUTION_CAPTION_INVALID",
  "SCENE_INSTRUCTION_INVALID",
  "SCENE_REVISION_TOO_LARGE",
  "SCENE_REVISION_STALE",
  "SCENE_RUN_NOT_ACCEPTABLE",
] as const;

export type ApiErrorReason = (typeof API_ERROR_REASONS)[number];

const isApiErrorCode = (value: string): value is ApiErrorCode =>
  API_ERROR_CODES.some((code) => code === value);

const isApiErrorReason = (value: string): value is ApiErrorReason =>
  API_ERROR_REASONS.some((reason) => reason === value);

export interface ApiErrorParams {
  /** HTTP 状态码；网络错误时相关错误另由 NetworkError 表示。 */
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly reason: ApiErrorReason | null;
  readonly message: string;
}

/** 后端错误响应 `{"error":{"code","message","details":{"reason"}}}` 的强类型表示。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly reason: ApiErrorReason | null;

  constructor(params: ApiErrorParams) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.reason = params.reason;
  }
}

/** fetch 自身失败（后端未启动、断网、被代理拒绝）。 */
export class NetworkError extends Error {
  constructor() {
    super("无法连接服务器，请稍后重试");
    this.name = "NetworkError";
  }
}

const FALLBACK_MESSAGE = "请求失败，请稍后重试";

export const parseApiError = (status: number, payload: unknown): ApiError => {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return new ApiError({ status, code: "INTERNAL", reason: null, message: FALLBACK_MESSAGE });
  }

  const rawCode = payload.error.code;
  const rawMessage = payload.error.message;
  const details = payload.error.details;

  const code: ApiErrorCode =
    typeof rawCode === "string" && isApiErrorCode(rawCode) ? rawCode : "INTERNAL";
  const message =
    typeof rawMessage === "string" && rawMessage.length > 0 ? rawMessage : FALLBACK_MESSAGE;
  const reason: ApiErrorReason | null =
    isRecord(details) && typeof details.reason === "string" && isApiErrorReason(details.reason)
      ? details.reason
      : null;

  return new ApiError({ status, code, reason, message });
};
