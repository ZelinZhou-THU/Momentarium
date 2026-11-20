import { parseExhibitionDetail } from "../../objects/gallery/ExhibitionDetail";
import type { ExhibitionDetail } from "../../objects/gallery/ExhibitionDetail";
import type { GroupInput } from "../../objects/gallery/GroupInput";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/**
 * 对应后端 UpdateCurationMessage（POST /api/updatecuration，gallery 服务）：
 * 整体替换标题/叙事/章节与照片顺序，成功后返回最新 ExhibitionDetail。
 */
export class UpdateCurationAPI {
  constructor(
    readonly exhibitionId: string,
    readonly title: string,
    readonly narrative: string,
    readonly groups: readonly GroupInput[],
  ) {}

  send(): Promise<ExhibitionDetail> {
    return send(
      {
        routeName: apiName("UpdateCurationAPI"),
        body: {
          exhibitionId: this.exhibitionId,
          title: this.title,
          narrative: this.narrative,
          groups: this.groups,
        },
      },
      parseExhibitionDetail,
    );
  }
}
