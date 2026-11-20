import { parsePublishedSceneResponse } from "../../objects/gallery/PublishedSceneResponse";
import type { PublishedSceneResponse } from "../../objects/gallery/PublishedSceneResponse";
import { apiName } from "../shared/apiName";
import { send, type ApiCallOptions } from "../shared/send";

export class GetPublishedSceneAPI {
  constructor(readonly exhibitionId: string) {}

  send(options?: ApiCallOptions): Promise<PublishedSceneResponse> {
    return send(
      { routeName: apiName("GetPublishedSceneAPI"), body: { exhibitionId: this.exhibitionId } },
      parsePublishedSceneResponse,
      { ...options, authentication: "none" },
    );
  }
}
