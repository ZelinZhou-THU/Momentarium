import { parseContributionAdoptionView } from "../../objects/gallery/Contribution";
import type { AdoptedLocationInput, ContributionAdoptionView } from "../../objects/gallery/Contribution";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 AdoptContributionMessage（POST /api/adoptcontribution，仅创建者）。
 * v1.12：采用只剩「收进草稿」——把投稿照片与讲述收进草稿的新照片，不再支持关联已有照片，
 * 因此请求去掉 targetPhotoId；caption 可空（预填建议图注，清空传空串），location 可选。
 * 服务端按 expectedVersion 核对；同版本重复采用幂等。
 * v1.15：groupId 可选，首次采用时把新照片放进该章节末尾；null 仍落入未分组；原地更新忽略。
 */
export class AdoptContributionAPI {
  constructor(
    readonly contributionId: string,
    readonly expectedVersion: number,
    readonly caption: string | null,
    readonly location: AdoptedLocationInput | null,
    readonly groupId: string | null = null,
  ) {}

  send(options?: ApiCallOptions): Promise<ContributionAdoptionView> {
    return send(
      {
        routeName: apiName("AdoptContributionAPI"),
        body: {
          contributionId: this.contributionId,
          expectedVersion: this.expectedVersion,
          caption: this.caption,
          location: this.location,
          groupId: this.groupId,
        },
      },
      parseContributionAdoptionView,
      options,
    );
  }
}
