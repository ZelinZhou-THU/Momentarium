import { parseSceneRunView } from "../../objects/gallery/SceneRunView";
import type { SceneRunView } from "../../objects/gallery/SceneRunView";
import { apiName } from "../shared/apiName";
import { send, type ApiCallOptions } from "../shared/send";

/** 对应后端 GetSceneRunByIdMessage（POST /api/getscenerunbyid）：读取某次运行的完整视图供预览。 */
export class GetSceneRunByIdAPI {
  constructor(readonly runId: string) {}

  send(options?: ApiCallOptions): Promise<SceneRunView> {
    return send(
      { routeName: apiName("GetSceneRunByIdAPI"), body: { runId: this.runId } },
      parseSceneRunView,
      options,
    );
  }
}
