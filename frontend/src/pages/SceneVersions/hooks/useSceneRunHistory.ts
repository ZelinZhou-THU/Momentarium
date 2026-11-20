import { useEffect, useState } from "react";
import { ApiError } from "../../../apis/shared/ApiError";
import { describeApiError } from "../../../apis/shared/describeApiError";
import { ListSceneRunsAPI } from "../../../apis/scene/ListSceneRunsAPI";
import { clearSession } from "../../../stores/sessionStore";
import { buildVersionsListState } from "../functions/buildVersionsListState";
import type { VersionsListState } from "../objects/SceneVersionsState";

export interface SceneRunHistoryModel {
  readonly listState: VersionsListState;
  readonly reload: () => void;
}

/** 版本列表：401 清会话交给受保护路由，其它错误给可重试错误态；恢复成功后由页面 reload（保留旧列表直到新数据到达）。 */
export const useSceneRunHistory = (exhibitionId: string): SceneRunHistoryModel => {
  const [listState, setListState] = useState<VersionsListState>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    new ListSceneRunsAPI(exhibitionId).send().then(
      (response) => setListState(buildVersionsListState(response.runs)),
      (error: unknown) => {
        if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
          clearSession();
          return;
        }
        setListState({ status: "error", message: describeApiError(error, {}) });
      },
    );
  }, [exhibitionId, reloadCount]);

  return { listState, reload: () => setReloadCount((count) => count + 1) };
};
