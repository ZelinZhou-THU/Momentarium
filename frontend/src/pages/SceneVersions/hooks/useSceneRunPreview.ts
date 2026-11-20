import { useEffect, useState } from "react";
import { describeApiError } from "../../../apis/shared/describeApiError";
import { GetSceneRunByIdAPI } from "../../../apis/scene/GetSceneRunByIdAPI";
import type { VersionPreviewState } from "../objects/SceneVersionsState";

/** 按选中 runId 拉完整运行（含代码）；切换选择时中止旧请求，旧响应不会覆盖新选择。 */
export const useSceneRunPreview = (runId: string | null): VersionPreviewState => {
  const [state, setState] = useState<VersionPreviewState>({ status: "idle" });

  useEffect(() => {
    if (runId === null) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading", runId });
    new GetSceneRunByIdAPI(runId).send({ signal: controller.signal }).then(
      (run) => setState({ status: "ready", run }),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", runId, message: describeApiError(error, {}) });
        }
      },
    );
    return () => controller.abort();
  }, [runId]);

  return state;
};
