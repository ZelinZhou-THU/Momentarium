import { CancelSceneAPI } from "../../../../apis/scene/CancelSceneAPI";
import { GenerateSceneAPI } from "../../../../apis/scene/GenerateSceneAPI";
import { GetSceneRunAPI } from "../../../../apis/scene/GetSceneRunAPI";
import { ReviewSceneAPI } from "../../../../apis/scene/ReviewSceneAPI";
import type { SceneRuntimeEvidence } from "../../../../apis/scene/objects/SceneRuntimeEvidence";
import type { SceneRunView } from "../../../../objects/gallery/SceneRunView";

export interface ReviewSceneSubmission {
  readonly runId: string;
  readonly captures: readonly string[];
  readonly runtime: SceneRuntimeEvidence;
}

/**
 * ScenePanel 依赖的场景服务边界（契约 §4.2 的四条消息）。
 * 页面/测试可注入替身（mock）驱动状态机；生产使用 createSceneApiClient()。
 */
export interface SceneApiClient {
  generateScene(exhibitionId: string, hint: string | null): Promise<SceneRunView>;
  getSceneRun(exhibitionId: string): Promise<SceneRunView>;
  cancelScene(runId: string): Promise<SceneRunView>;
  reviewScene(submission: ReviewSceneSubmission): Promise<SceneRunView>;
}

export const createSceneApiClient = (): SceneApiClient => ({
  generateScene: (exhibitionId, hint) => new GenerateSceneAPI(exhibitionId, hint).send(),
  getSceneRun: (exhibitionId) => new GetSceneRunAPI(exhibitionId).send(),
  cancelScene: (runId) => new CancelSceneAPI(runId).send(),
  reviewScene: (submission) => new ReviewSceneAPI(submission.runId, submission.captures, submission.runtime).send(),
});
