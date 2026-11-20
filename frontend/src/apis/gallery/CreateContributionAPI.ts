import { parseContributionSummary } from "../../objects/gallery/Contribution";
import type {
  ContributionLocationInput,
  ContributionSummary,
} from "../../objects/gallery/Contribution";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 CreateContributionMessage（POST /api/createcontribution，仅 active 投稿者）。
 * v1.12：投稿必须带图，创建只建 draft（不再有 submit 参数）；照片另走投稿上传附加，
 * 随后用 updatecontribution submit=true 提交。suggestedCaption 仍可空（≤120 字）。
 */
export class CreateContributionAPI {
  constructor(
    readonly exhibitionId: string,
    readonly memoryText: string,
    readonly suggestedCaption: string | null = null,
    readonly location: ContributionLocationInput | null = null,
  ) {}

  send(options?: ApiCallOptions): Promise<ContributionSummary> {
    return send(
      {
        routeName: apiName("CreateContributionAPI"),
        body: {
          exhibitionId: this.exhibitionId,
          memoryText: this.memoryText,
          suggestedCaption: this.suggestedCaption,
          location: this.location,
        },
      },
      parseContributionSummary,
      options,
    );
  }
}
