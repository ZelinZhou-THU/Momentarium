import type { UploadFailureReason } from "../../../objects/gallery/UploadPhotosResponse";

const UPLOAD_FAILURE_MESSAGES: Record<UploadFailureReason, string> = {
  UPLOAD_TOO_LARGE: "文件超过 15MB",
  UPLOAD_UNSUPPORTED_TYPE: "格式不支持（仅 JPG / PNG / WebP）",
};

/** 上传失败的 reason 码 → 面向用户的中文说明（封闭集合，新增码需两侧同步）。 */
export const describeUploadFailure = (reason: UploadFailureReason): string =>
  UPLOAD_FAILURE_MESSAGES[reason];
