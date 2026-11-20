import { parseContributionSummary } from "../../objects/gallery/Contribution";
import type {
  ContributionLocationInput,
  ContributionSummary,
} from "../../objects/gallery/Contribution";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 UpdateContributionMessage（POST /api/updatecontribution，仅投稿者本人）。
 * v1.10：submit=false 保存（draft→draft、submitted→仍待审并让 owner 看到待确认、declined→declined）；
 * submit=true 进入/重新进入 submitted；removePhoto=true 仅 draft 可移除照片（v1.12 起已提交/已拒绝不能清空）。
 * 版本按内容/照片变化 +1。
 * v1.11：suggestedCaption 为可空建议图注（≤120 字，清空传 null）。
 */
export class UpdateContributionAPI {
  constructor(
    readonly contributionId: string,
    readonly memoryText: string,
    readonly location: ContributionLocationInput | null = null,
    readonly removePhoto = false,
    readonly submit = false,
    readonly suggestedCaption: string | null = null,
  ) {}

  send(options?: ApiCallOptions): Promise<ContributionSummary> {
    return send(
      {
        routeName: apiName("UpdateContributionAPI"),
        body: {
          contributionId: this.contributionId,
          memoryText: this.memoryText,
          suggestedCaption: this.suggestedCaption,
          location: this.location,
          removePhoto: this.removePhoto,
          submit: this.submit,
        },
      },
      parseContributionSummary,
      options,
    );
  }
}
