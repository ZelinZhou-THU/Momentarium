import { requireArray, requireObject } from "../../apis/shared/decode";
import { parseSceneRunSummary } from "./SceneRunSummary";
import type { SceneRunSummary } from "./SceneRunSummary";

/** 契约 §4.1 SceneRunHistoryResponse(runs)：最新在前。 */
export interface SceneRunHistoryResponse {
  readonly runs: readonly SceneRunSummary[];
}

export const parseSceneRunHistoryResponse = (value: unknown, path = "history"): SceneRunHistoryResponse => {
  const record = requireObject(value, path);
  return {
    runs: requireArray(record.runs, `${path}.runs`).map((run, index) =>
      parseSceneRunSummary(run, `${path}.runs[${index}]`),
    ),
  };
};
