import { parseSceneRunView } from "../../objects/gallery/SceneRunView";
import type { SceneRunView } from "../../objects/gallery/SceneRunView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/**
 * 对应后端 GenerateSceneMessage（POST /api/generatescene，scene 服务）：
 * 触发一次场景生成；同一展览已有未结束运行时后端幂等返回该运行（契约 §4.2）。
 */
export class GenerateSceneAPI {
  constructor(
    readonly exhibitionId: string,
    readonly hint: string | null,
  ) {}

  send(): Promise<SceneRunView> {
    return send(
      {
        routeName: apiName("GenerateSceneAPI"),
        body: { exhibitionId: this.exhibitionId, hint: this.hint },
      },
      parseSceneRunView,
    );
  }
}
