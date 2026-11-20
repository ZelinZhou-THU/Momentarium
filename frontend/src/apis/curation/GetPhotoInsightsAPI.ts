import { parsePhotoInsightsResponse } from "../../objects/curation/PhotoInsightsResponse";
import type { PhotoInsightsResponse } from "../../objects/curation/PhotoInsightsResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 GetPhotoInsightsMessage（POST /api/getphotoinsights）：照片 AI 解读与最近场景题面。 */
export class GetPhotoInsightsAPI {
  constructor(readonly exhibitionId: string) {}

  send(): Promise<PhotoInsightsResponse> {
    return send(
      { routeName: apiName("GetPhotoInsightsAPI"), body: { exhibitionId: this.exhibitionId } },
      parsePhotoInsightsResponse,
    );
  }
}
