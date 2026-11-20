import { useEffect, useState } from "react";
import { ApiError } from "../../../apis/shared/ApiError";
import { ListMyExhibitionsAPI } from "../../../apis/gallery/ListMyExhibitionsAPI";
import { rememberExhibitionScenePalettes } from "../../../stores/exhibitionPaletteStore";
import { clearSession } from "../../../stores/sessionStore";
import { buildExhibitionsListState } from "../functions/buildExhibitionsListState";
import { describeGalleryError } from "../../../apis/gallery/describeGalleryError";
import type { ExhibitionsListState } from "../objects/ExhibitionsPage";

export interface MyExhibitionsModel {
  readonly listState: ExhibitionsListState;
  readonly reload: () => void;
}

/**
 * 我的展览列表：加载 / 空 / 就绪 / 错误 四态；401 清会话交给受保护路由跳登录，
 * 其它错误展示可重试错误态。新建、改名、删除成功后由页面调用 reload 刷新。
 */
export const useMyExhibitions = (): MyExhibitionsModel => {
  const [listState, setListState] = useState<ExhibitionsListState>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    setListState({ status: "loading" });
    new ListMyExhibitionsAPI().send().then(
      (response) => {
        rememberExhibitionScenePalettes(response.exhibitions);
        setListState(buildExhibitionsListState(response.exhibitions));
      },
      (error: unknown) => {
        if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
          clearSession();
          return;
        }
        setListState({ status: "error", message: describeGalleryError(error) });
      },
    );
  }, [reloadCount]);

  return {
    listState,
    reload: () => setReloadCount((count) => count + 1),
  };
};
