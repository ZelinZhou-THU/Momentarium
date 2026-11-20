import { parsePhotoLocationCandidatesResponse } from "../../objects/curation/PhotoLocationCandidatesResponse";
import type { PhotoLocationCandidatesResponse } from "../../objects/curation/PhotoLocationCandidatesResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 SuggestPhotoLocationMessage（POST /api/suggestphotolocation，仅作者）。
 * 点击「AI 识别地点」才调用；返回后替换当前候选集，不自动确认、不写公开位置。
 */
export class SuggestPhotoLocationAPI {
  constructor(readonly photoId: string) {}

  send(options?: ApiCallOptions): Promise<PhotoLocationCandidatesResponse> {
    return send(
      { routeName: apiName("SuggestPhotoLocationAPI"), body: { photoId: this.photoId } },
      parsePhotoLocationCandidatesResponse,
      options,
    );
  }
}
