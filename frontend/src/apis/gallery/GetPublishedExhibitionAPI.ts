import { parsePublicExhibitionView } from "../../objects/gallery/PublicExhibitionView";
import type { PublicExhibitionView } from "../../objects/gallery/PublicExhibitionView";
import { apiName } from "../shared/apiName";
import { send, type ApiCallOptions } from "../shared/send";

/**
 * 对应后端 GetPublishedExhibitionMessage（POST /api/getpublishedexhibition，公开路由）。
 * 公开请求不携带会话令牌。
 */
export class GetPublishedExhibitionAPI {
  constructor(readonly exhibitionId: string) {}

  send(options?: ApiCallOptions): Promise<PublicExhibitionView> {
    return send(
      {
        routeName: apiName("GetPublishedExhibitionAPI"),
        body: { exhibitionId: this.exhibitionId },
      },
      parsePublicExhibitionView,
      { ...options, authentication: "none" },
    );
  }
}
