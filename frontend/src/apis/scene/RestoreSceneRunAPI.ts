import { parseSceneRunView } from "../../objects/gallery/SceneRunView";
import type { SceneRunView } from "../../objects/gallery/SceneRunView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 RestoreSceneRunMessage（POST /api/restorescenerun）：把旧的成功版本恢复为当前场景。 */
export class RestoreSceneRunAPI {
  constructor(readonly runId: string) {}

  send(): Promise<SceneRunView> {
    return send({ routeName: apiName("RestoreSceneRunAPI"), body: { runId: this.runId } }, parseSceneRunView);
  }
}
