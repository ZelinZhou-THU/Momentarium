import { parsePublishExhibitionResponse } from "../../objects/gallery/PublishExhibitionResponse";
import type { PublishExhibitionResponse } from "../../objects/gallery/PublishExhibitionResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 PublishExhibitionMessage（POST /api/publish，gallery 服务）。首次/更新发布共用。 */
export class PublishAPI {
  constructor(readonly exhibitionId: string) {}

  send(): Promise<PublishExhibitionResponse> {
    return send(
      { routeName: apiName("PublishAPI"), body: { exhibitionId: this.exhibitionId } },
      parsePublishExhibitionResponse,
    );
  }
}
