import { parseAuthorPageView } from "../../objects/gallery/AuthorPageView";
import type { AuthorPageView } from "../../objects/gallery/AuthorPageView";
import { apiName } from "../shared/apiName";
import { send, type ApiCallOptions } from "../shared/send";

/** 对应后端 GetAuthorPageMessage（POST /api/getauthorpage，公开路由，不携带会话令牌）。 */
export class GetAuthorPageAPI {
  constructor(readonly username: string) {}

  send(options?: ApiCallOptions): Promise<AuthorPageView> {
    return send(
      { routeName: apiName("GetAuthorPageAPI"), body: { username: this.username } },
      parseAuthorPageView,
      { ...options, authentication: "none" },
    );
  }
}
