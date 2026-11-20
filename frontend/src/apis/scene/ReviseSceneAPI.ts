import { parseSceneRunView } from "../../objects/gallery/SceneRunView";
import type { SceneRunView } from "../../objects/gallery/SceneRunView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 ReviseSceneMessage（POST /api/revisescene，仅作者）。
 * 基于当前采用场景创建 kind=revise 的异步运行；成功结果只是候选，需 acceptscenerun 才切换当前。
 */
export class ReviseSceneAPI {
  constructor(
    readonly parentRunId: string,
    readonly instruction: string,
  ) {}

  send(options?: ApiCallOptions): Promise<SceneRunView> {
    return send(
      {
        routeName: apiName("ReviseSceneAPI"),
        body: { parentRunId: this.parentRunId, instruction: this.instruction },
      },
      parseSceneRunView,
      options,
    );
  }
}
