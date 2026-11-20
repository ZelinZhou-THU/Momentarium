import { parseMyExhibitionsResponse } from "../../objects/gallery/MyExhibitionsResponse";
import type { MyExhibitionsResponse } from "../../objects/gallery/MyExhibitionsResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 ListMyExhibitionsMessage（POST /api/listmyexhibitions，无请求消息）。 */
export class ListMyExhibitionsAPI {
  send(): Promise<MyExhibitionsResponse> {
    return send({ routeName: apiName("ListMyExhibitionsAPI") }, parseMyExhibitionsResponse);
  }
}
