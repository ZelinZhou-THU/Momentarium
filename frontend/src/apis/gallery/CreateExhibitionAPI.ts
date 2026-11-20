import { parseCreateExhibitionResponse } from "../../objects/gallery/CreateExhibitionResponse";
import type { CreateExhibitionResponse } from "../../objects/gallery/CreateExhibitionResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 CreateExhibitionMessage（POST /api/createexhibition）。 */
export class CreateExhibitionAPI {
  constructor(readonly title: string) {}

  send(): Promise<CreateExhibitionResponse> {
    return send(
      { routeName: apiName("CreateExhibitionAPI"), body: { title: this.title } },
      parseCreateExhibitionResponse,
    );
  }
}
