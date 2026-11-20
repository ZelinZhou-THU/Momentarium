import { parseSceneRunView } from "../../objects/gallery/SceneRunView";
import type { SceneRunView } from "../../objects/gallery/SceneRunView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 AcceptSceneRunMessage（POST /api/acceptscenerun，仅作者）。
 * 采用一条成功的修订候选，切换 current_scene_run_id；只改草稿指针，公开页仍需重新发布。
 */
export class AcceptSceneRunAPI {
  constructor(readonly runId: string) {}

  send(options?: ApiCallOptions): Promise<SceneRunView> {
    return send(
      { routeName: apiName("AcceptSceneRunAPI"), body: { runId: this.runId } },
      parseSceneRunView,
      options,
    );
  }
}
