import { parseEmptyResponse } from "../../objects/EmptyResponse";
import type { EmptyResponse } from "../../objects/EmptyResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 UpdateExhibitionMetaMessage（POST /api/updateexhibitionmeta）。 */
export class UpdateExhibitionMetaAPI {
  constructor(
    readonly exhibitionId: string,
    readonly title: string,
    readonly narrative: string,
  ) {}

  send(): Promise<EmptyResponse> {
    return send(
      {
        routeName: apiName("UpdateExhibitionMetaAPI"),
        body: {
          exhibitionId: this.exhibitionId,
          title: this.title,
          narrative: this.narrative,
        },
      },
      parseEmptyResponse,
    );
  }
}
