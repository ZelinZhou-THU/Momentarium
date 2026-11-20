import { parseCoverRenderUploadResponse, type CoverRenderUploadResponse } from "../../objects/gallery/CoverRenderUploadResponse";
import { sendFormData, type ApiCallOptions } from "../shared/send";

export class UploadCoverRenderAPI {
  constructor(readonly exhibitionId: string, readonly file: File) {}
  send(options?: ApiCallOptions): Promise<CoverRenderUploadResponse> {
    const formData = new FormData();
    formData.append("file", this.file);
    return sendFormData({ path: `/api/exhibitions/${encodeURIComponent(this.exhibitionId)}/cover-render`, formData }, parseCoverRenderUploadResponse, options);
  }
}
