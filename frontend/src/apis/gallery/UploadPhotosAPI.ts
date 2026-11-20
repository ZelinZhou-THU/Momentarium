import { parseUploadPhotosResponse } from "../../objects/gallery/UploadPhotosResponse";
import type { UploadPhotosResponse } from "../../objects/gallery/UploadPhotosResponse";
import { sendFormDataWithProgress } from "../shared/send";
import type { FormDataProgressOptions } from "../shared/send";

/** 非消息路由 POST /api/photos/upload（multipart/form-data：exhibitionId + files×N）。 */
const UPLOAD_PHOTOS_PATH = "/api/photos/upload";

export class UploadPhotosAPI {
  constructor(
    readonly exhibitionId: string,
    readonly files: readonly File[],
  ) {}

  /** onUploadProgress 报告请求体的真实发送进度；发送完到响应返回之间是服务端处理（方向校正、缩略图）。 */
  send(options: FormDataProgressOptions = {}): Promise<UploadPhotosResponse> {
    const formData = new FormData();
    formData.append("exhibitionId", this.exhibitionId);
    this.files.forEach((file) => formData.append("files", file));
    return sendFormDataWithProgress({ path: UPLOAD_PHOTOS_PATH, formData }, parseUploadPhotosResponse, options);
  }
}
