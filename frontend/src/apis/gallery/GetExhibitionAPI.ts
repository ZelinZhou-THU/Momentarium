import { parseExhibitionDetail } from "../../objects/gallery/ExhibitionDetail";
import type { ExhibitionDetail } from "../../objects/gallery/ExhibitionDetail";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 GetExhibitionMessage（POST /api/getexhibition）。 */
export class GetExhibitionAPI {
  constructor(readonly exhibitionId: string) {}

  send(): Promise<ExhibitionDetail> {
    return send(
      { routeName: apiName("GetExhibitionAPI"), body: { exhibitionId: this.exhibitionId } },
      parseExhibitionDetail,
    );
  }
}
