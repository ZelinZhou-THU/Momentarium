import { describeApiError } from "../shared/describeApiError";
import type { ApiErrorReason } from "../shared/ApiError";

const CONTRIBUTION_REASON_MESSAGES: Partial<Record<ApiErrorReason, string>> = {
  CONTRIBUTION_MEMORY_INVALID: "回忆内容无效：提交时请填写 1–1000 个字",
  CONTRIBUTION_CAPTION_INVALID: "建议图注不能超过 120 个字，也不能包含换行或控制字符",
  CONTRIBUTION_BATCH_LIMIT: "单批最多上传 10 张照片",
  CONTRIBUTION_QUOTA_PHOTOS: "本展览的投稿照片数量已达上限",
  CONTRIBUTION_QUOTA_BYTES: "本展览的投稿存储空间已达上限",
  CONTRIBUTION_SELF_NOT_ALLOWED: "不能向自己的展览投稿",
  CONTRIBUTION_PHOTO_REQUIRED: "提交或采用需要一张照片；请先补一张照片再试",
  CONTRIBUTION_ALREADY_ADOPTED: "这条回忆已经被采用，不能标记为不采用；如需调整请先移除已采用讲述",
  CONTRIBUTION_DECLINED: "这条回忆已被标记为不采用，请让投稿者修改后重新提交",
  INVITE_CLOSED: "邀请链接已关闭，无法再加入",
  PARTICIPANT_REVOKED: "参与关系已被创建者撤销，不能再保存或提交回忆",
  CONTRIBUTION_WITHDRAWN: "这条回忆已撤回",
  CONTRIBUTION_VERSION_CONFLICT: "这条回忆已在别处更新，请刷新后重试",
  CONTRIBUTION_TARGET_CONFLICT: "这条回忆已采用到其他照片，请先移除已采用的讲述再重新采用",
  UPLOAD_TOO_LARGE: "文件过大",
  UPLOAD_UNSUPPORTED_TYPE: "文件格式不支持",
};

/** 邀请/投稿相关错误文案：reason 码优先，401 提示重新登录，其余按后端 message 兜底。 */
export const describeContributionError = (error: unknown): string =>
  describeApiError(error, CONTRIBUTION_REASON_MESSAGES, "登录状态已失效，请重新登录");
