import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../../apis/shared/ApiError";
import { GetExhibitionAPI } from "../../../apis/gallery/GetExhibitionAPI";
import { rememberExhibitionScenePalettes } from "../../../stores/exhibitionPaletteStore";
import { clearSession } from "../../../stores/sessionStore";
import { describeGalleryError } from "../../../apis/gallery/describeGalleryError";
import type { WorkspaceDetailState } from "../objects/WorkspaceState";

export interface ExhibitionWorkspaceModel {
  readonly detailState: WorkspaceDetailState;
  /** 显式刷新（照片/策展等草稿操作后）：已就绪时保留当前页面重新拉取，失败进入 error 态。 */
  readonly reload: () => void;
  /** 静默刷新（场景运行/发布等非草稿变化后）：不打断页面、不重置策展草稿。 */
  readonly refreshSilently: () => void;
}

/**
 * 工作台展览详情：加载 / 就绪 / 错误三态。
 * - reload：草稿数据变化（上传/删除/换封面/保存策展）后重新拉取；同一展览已就绪时不回到 loading，
 *   业务区域保持挂载（未保存的策展草稿、主题提案、上传结果等页面状态不被清掉）；
 * - refreshSilently：场景运行/发布等后台状态变化后静默更新 detail（publication/sceneRun/sceneStale），
 *   不闪 loading；失败不改变当前页面（401 除外）。
 * 每次拿到新的 detail 都登记场景主色，工作台随当前采用场景换配色。
 */
export const useExhibitionWorkspace = (exhibitionId: string): ExhibitionWorkspaceModel => {
  const [detailState, setDetailState] = useState<WorkspaceDetailState>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    setDetailState((current) =>
      current.status === "ready" && current.detail.id === exhibitionId ? current : { status: "loading" },
    );
    new GetExhibitionAPI(exhibitionId).send().then(
      (detail) => setDetailState({ status: "ready", detail }),
      (error: unknown) => {
        if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
          clearSession();
          return;
        }
        setDetailState({ status: "error", message: describeGalleryError(error) });
      },
    );
  }, [exhibitionId, reloadCount]);

  const refreshSilently = useCallback((): void => {
    new GetExhibitionAPI(exhibitionId).send().then(
      (detail) => setDetailState({ status: "ready", detail }),
      (error: unknown) => {
        if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
          clearSession();
        }
      },
    );
  }, [exhibitionId]);

  const readyDetail = detailState.status === "ready" ? detailState.detail : null;
  useEffect(() => {
    if (readyDetail !== null) rememberExhibitionScenePalettes([readyDetail]);
  }, [readyDetail]);

  return {
    detailState,
    reload: () => setReloadCount((count) => count + 1),
    refreshSilently,
  };
};
