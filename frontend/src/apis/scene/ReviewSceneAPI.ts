import { parseSceneRunView } from "../../objects/gallery/SceneRunView";
import type { SceneRunView } from "../../objects/gallery/SceneRunView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { SceneRuntimeEvidence } from "./objects/SceneRuntimeEvidence";

/**
 * 对应后端 ReviewSceneMessage（POST /api/reviewscene，scene 服务）：
 * 仅在 awaiting_capture 可回传；captures 为 4 张 JPEG data URL，runtime 为契约 §4.1 形状（请求体 UTF-8 总体 ≤12 MiB，超限 HTTP 400 BAD_REQUEST）。
 */
export class ReviewSceneAPI {
  constructor(
    readonly runId: string,
    readonly captures: readonly string[],
    readonly runtime: SceneRuntimeEvidence,
  ) {}

  send(): Promise<SceneRunView> {
    return send(
      {
        routeName: apiName("ReviewSceneAPI"),
        body: { runId: this.runId, captures: [...this.captures], runtime: this.runtime },
      },
      parseSceneRunView,
    );
  }
}
