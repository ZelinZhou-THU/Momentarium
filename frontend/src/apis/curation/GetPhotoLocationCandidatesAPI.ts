import { parsePhotoLocationCandidatesResponse } from "../../objects/curation/PhotoLocationCandidatesResponse";
import type { PhotoLocationCandidatesResponse } from "../../objects/curation/PhotoLocationCandidatesResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 GetPhotoLocationCandidatesMessage（POST /api/getphotolocationcandidates，仅作者）。
 * 选中照片时读取已存候选，不触发 AI；无候选返回空数组。
 */
export class GetPhotoLocationCandidatesAPI {
  constructor(readonly photoId: string) {}

  send(options?: ApiCallOptions): Promise<PhotoLocationCandidatesResponse> {
    return send(
      {
        routeName: apiName("GetPhotoLocationCandidatesAPI"),
        body: { photoId: this.photoId },
      },
      parsePhotoLocationCandidatesResponse,
      options,
    );
  }
}
