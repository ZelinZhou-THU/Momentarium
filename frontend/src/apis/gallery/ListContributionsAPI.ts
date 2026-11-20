import { parseContributionsResponse } from "../../objects/gallery/Contribution";
import type { ContributionsResponse } from "../../objects/gallery/Contribution";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 ListContributionsMessage（POST /api/listcontributions）。
 * exhibitionId=null 时由服务端按角色决定范围：投稿者返回自己的投稿，创建者返回本展览全部投稿。
 */
export class ListContributionsAPI {
  constructor(readonly exhibitionId: string | null = null) {}

  send(options?: ApiCallOptions): Promise<ContributionsResponse> {
    return send(
      { routeName: apiName("ListContributionsAPI"), body: { exhibitionId: this.exhibitionId } },
      parseContributionsResponse,
      options,
    );
  }
}
