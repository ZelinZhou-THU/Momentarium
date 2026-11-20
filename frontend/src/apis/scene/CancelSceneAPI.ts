import { parseSceneRunView } from "../../objects/gallery/SceneRunView";
import type { SceneRunView } from "../../objects/gallery/SceneRunView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 CancelSceneMessage（POST /api/cancelscene，scene 服务）：仅非终态可取消。 */
export class CancelSceneAPI {
  constructor(readonly runId: string) {}

  send(): Promise<SceneRunView> {
    return send({ routeName: apiName("CancelSceneAPI"), body: { runId: this.runId } }, parseSceneRunView);
  }
}
