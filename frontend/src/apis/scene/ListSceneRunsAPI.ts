import { parseSceneRunHistoryResponse } from "../../objects/scene/SceneRunHistoryResponse";
import type { SceneRunHistoryResponse } from "../../objects/scene/SceneRunHistoryResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 ListSceneRunsMessage（POST /api/listsceneruns）：版本历史列表。 */
export class ListSceneRunsAPI {
  constructor(readonly exhibitionId: string) {}

  send(): Promise<SceneRunHistoryResponse> {
    return send(
      { routeName: apiName("ListSceneRunsAPI"), body: { exhibitionId: this.exhibitionId } },
      parseSceneRunHistoryResponse,
    );
  }
}
