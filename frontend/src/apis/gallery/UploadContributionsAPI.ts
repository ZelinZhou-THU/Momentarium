import { parseContributionUploadResponse } from "../../objects/gallery/ContributionUpload";
import type { ContributionUploadResponse } from "../../objects/gallery/ContributionUpload";
import { sendFormDataWithProgress } from "../shared/send";
import type { FormDataProgressOptions } from "../shared/send";

/** 非消息路由 POST /api/contributions/upload（multipart/form-data：exhibitionId + [contributionId] + files）。 */
const UPLOAD_CONTRIBUTIONS_PATH = "/api/contributions/upload";

export class UploadContributionsAPI {
  constructor(
    readonly exhibitionId: string,
    readonly files: readonly File[],
    /** 替换已有投稿文件时必填（只会传 1 个文件）。 */
    readonly contributionId: string | null = null,
  ) {}

  send(options: FormDataProgressOptions = {}): Promise<ContributionUploadResponse> {
    const formData = new FormData();
    formData.append("exhibitionId", this.exhibitionId);
    if (this.contributionId !== null) {
      formData.append("contributionId", this.contributionId);
    }
    this.files.forEach((file) => formData.append("files", file));
    return sendFormDataWithProgress(
      { path: UPLOAD_CONTRIBUTIONS_PATH, formData },
      parseContributionUploadResponse,
      options,
    );
  }
}
