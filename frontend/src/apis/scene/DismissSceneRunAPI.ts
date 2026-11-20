import { parseSceneRunView } from "../../objects/gallery/SceneRunView";
import type { SceneRunView } from "../../objects/gallery/SceneRunView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

export class DismissSceneRunAPI {
  constructor(readonly runId: string) {}

  send(options?: ApiCallOptions): Promise<SceneRunView> {
    return send({ routeName: apiName("DismissSceneRunAPI"), body: { runId: this.runId } }, parseSceneRunView, options);
  }
}
