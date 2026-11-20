import { parseEmptyResponse } from "../../objects/EmptyResponse";
import type { EmptyResponse } from "../../objects/EmptyResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 DeleteExhibitionMessage（POST /api/deleteexhibition）。 */
export class DeleteExhibitionAPI {
  constructor(readonly exhibitionId: string) {}

  send(): Promise<EmptyResponse> {
    return send(
      { routeName: apiName("DeleteExhibitionAPI"), body: { exhibitionId: this.exhibitionId } },
      parseEmptyResponse,
    );
  }
}
