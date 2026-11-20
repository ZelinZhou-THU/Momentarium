import { parseSceneRunView } from "../../objects/gallery/SceneRunView";
import type { SceneRunView } from "../../objects/gallery/SceneRunView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 GetSceneRunMessage（POST /api/getscenerun，scene 服务）：工作台轮询运行状态。 */
export class GetSceneRunAPI {
  constructor(readonly exhibitionId: string) {}

  send(): Promise<SceneRunView> {
    return send(
      { routeName: apiName("GetSceneRunAPI"), body: { exhibitionId: this.exhibitionId } },
      parseSceneRunView,
    );
  }
}
