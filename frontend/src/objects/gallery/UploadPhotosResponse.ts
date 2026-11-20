import { requireArray, requireObject, requireOneOf, requireString } from "../../apis/shared/decode";
import { parsePhotoView } from "./PhotoView";
import type { PhotoView } from "./PhotoView";

/** 契约 §5.1 上传失败的 reason 码（固定集合；后端新增 reason 时必须两侧同步）。 */
export type UploadFailureReason = "UPLOAD_TOO_LARGE" | "UPLOAD_UNSUPPORTED_TYPE";

const UPLOAD_FAILURE_REASONS: readonly UploadFailureReason[] = [
  "UPLOAD_TOO_LARGE",
  "UPLOAD_UNSUPPORTED_TYPE",
];

export interface UploadFailure {
  readonly fileName: string;
  readonly reason: UploadFailureReason;
}

/** 契约 §5.1 UploadPhotosResponse(photos, failures)：单文件失败不影响整批。 */
export interface UploadPhotosResponse {
  readonly photos: PhotoView[];
  readonly failures: UploadFailure[];
}

export const parseUploadFailure = (value: unknown, path = "uploadFailure"): UploadFailure => {
  const record = requireObject(value, path);
  return {
    fileName: requireString(record.fileName, `${path}.fileName`),
    reason: requireOneOf(record.reason, UPLOAD_FAILURE_REASONS, `${path}.reason`),
  };
};

export const parseUploadPhotosResponse = (
  value: unknown,
  path = "uploadPhotos",
): UploadPhotosResponse => {
  const record = requireObject(value, path);
  return {
    photos: requireArray(record.photos, `${path}.photos`).map((photo, index) =>
      parsePhotoView(photo, `${path}.photos[${index}]`),
    ),
    failures: requireArray(record.failures, `${path}.failures`).map((failure, index) =>
      parseUploadFailure(failure, `${path}.failures[${index}]`),
    ),
  };
};
