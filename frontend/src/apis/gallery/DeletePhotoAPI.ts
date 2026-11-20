import { parseEmptyResponse } from "../../objects/EmptyResponse";
import type { EmptyResponse } from "../../objects/EmptyResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 DeletePhotoMessage（POST /api/deletephoto）。 */
export class DeletePhotoAPI {
  constructor(readonly photoId: string) {}

  send(): Promise<EmptyResponse> {
    return send(
      { routeName: apiName("DeletePhotoAPI"), body: { photoId: this.photoId } },
      parseEmptyResponse,
    );
  }
}
