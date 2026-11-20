import { useCallback, useEffect, useReducer, useRef } from "react";
import { withViewTransition } from "../../../motion/viewTransition";
import { RUNTIME_VERSION } from "../../../scene/contract";
import { GetPublishedExhibitionAPI } from "../../../apis/gallery/GetPublishedExhibitionAPI";
import { rememberExhibitionScenePalettes } from "../../../stores/exhibitionPaletteStore";
import { GetPublishedSceneAPI } from "../../../apis/scene/GetPublishedSceneAPI";
import { ApiError, NetworkError } from "../../../apis/shared/ApiError";
import type { PublicShowState } from "../objects/PublicShowState";
import { createInitialPublicShowState, reducePublicShow } from "../functions/reducePublicShow";

import { preparePublicShowPhotos } from "../functions/preparePublicShowPhotos";

export interface PublishedShowController {
  readonly state: PublicShowState;
  /** 先导页「进入记忆」：拉 getpublishedscene + 准备展示图，然后切到 3D。 */
  enter(): void;
  /** 3D 内退出回先导页（销毁沙箱）。 */
  exit(): void;
  /** 加载失败/未发布时重试公开数据。 */
  retry(): void;
}

/**
 * 公开页数据与状态编排（只读、无需令牌）：
 * 加载 getpublishedexhibition（404→notfound）→ 先导页；进入时再拉 getpublishedscene
 * 并把公开照片降采样后交给沙箱。进入失败会给可重试错误态，不把 mock 当成功。
 */
export const usePublishedShow = (exhibitionId: string): PublishedShowController => {
  const [state, dispatch] = useReducer(reducePublicShow, undefined, createInitialPublicShowState);
  const loadAbortRef = useRef<AbortController | null>(null);
  const enterAbortRef = useRef<AbortController | null>(null);

  const load = useCallback((): void => {
    loadAbortRef.current?.abort();
    enterAbortRef.current?.abort();
    if (exhibitionId.length === 0) {
      dispatch({ type: "load_not_found" });
      return;
    }
    const controller = new AbortController();
    loadAbortRef.current = controller;
    dispatch({ type: "load_started" });
    void new GetPublishedExhibitionAPI(exhibitionId).send({ signal: controller.signal }).then((exhibition) => {
      if (controller.signal.aborted) return;
      rememberExhibitionScenePalettes([exhibition]);
      dispatch({ type: "load_succeeded", exhibition });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.code === "NOT_FOUND") dispatch({ type: "load_not_found" });
      else dispatch({ type: "load_failed", message: error instanceof NetworkError ? error.message : "请求失败，请稍后重试。" });
    });
  }, [exhibitionId]);

  useEffect(() => {
    load();
    return () => {
      loadAbortRef.current?.abort();
      enterAbortRef.current?.abort();
    };
  }, [load]);

  const enter = useCallback((): void => {
    if (state.status !== "ready" || state.playing !== null) return;
    const exhibition = state.exhibition;
    const controller = new AbortController();
    enterAbortRef.current?.abort();
    enterAbortRef.current = controller;
    dispatch({ type: "enter_started" });

    void new GetPublishedSceneAPI(exhibitionId).send({ signal: controller.signal }).then(async (scene) => {
      if (controller.signal.aborted) return;
      // wire 上 runtimeVersion 是字符串（spec §7 scene_runs.runtime_version text）；
      // 与当前沙箱契约版本不一致时明确报错，避免用不兼容代码去渲染。
      if (scene.runtimeVersion !== String(RUNTIME_VERSION)) {
        dispatch({
          type: "enter_failed",
          message: `场景版本不兼容（${scene.runtimeVersion} ≠ ${RUNTIME_VERSION}），请刷新页面或联系展览作者。`,
        });
        return;
      }
      try {
        const photos = await preparePublicShowPhotos(exhibition.photos, controller.signal);
        if (controller.signal.aborted) return;
        withViewTransition(() => dispatch({ type: "enter_succeeded", playing: { scene, photos } }), "scene-enter");
      } catch {
        if (controller.signal.aborted) return;
        dispatch({ type: "enter_failed", message: "照片加载失败，请稍后重试。" });
      }
    }).catch(() => {
      if (!controller.signal.aborted) dispatch({ type: "enter_failed", message: "场景暂不可用，请稍后重试。" });
    });
  }, [state, exhibitionId]);

  const exit = useCallback((): void => {
    enterAbortRef.current?.abort();
    withViewTransition(() => dispatch({ type: "exit" }), "scene-exit");
  }, []);

  const retry = useCallback((): void => {
    load();
  }, [load]);

  return { state, enter, exit, retry };
};
