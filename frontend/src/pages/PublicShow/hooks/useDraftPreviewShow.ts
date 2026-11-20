import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { GetPhotoInsightsAPI } from "../../../apis/curation/GetPhotoInsightsAPI";
import { GetExhibitionAPI } from "../../../apis/gallery/GetExhibitionAPI";
import { describeGalleryError } from "../../../apis/gallery/describeGalleryError";
import { fetchAuthorizedBlob } from "../../../apis/shared/authorizedFetch";
import { withViewTransition } from "../../../motion/viewTransition";
import { RUNTIME_VERSION } from "../../../scene/contract";
import { rememberExhibitionScenePalettes } from "../../../stores/exhibitionPaletteStore";
import type { SandboxPhotoTransfer } from "../../../scene/contract";
import { prepareDisplayPhotos } from "../../../scene/photoDisplay";
import {
  buildDraftPreviewExhibition,
  checkDraftPreview,
  draftPhotos,
  draftPreviewPresentation,
} from "../functions/buildDraftPreview";
import { createInitialPublicShowState, reducePublicShow } from "../functions/reducePublicShow";
import type { PublicPlayingScene } from "../objects/PublicShowState";
import type { ShowPresentation } from "../objects/ShowPresentation";
import type { PublishedShowController } from "./usePublishedShow";

export interface DraftPreviewController extends PublishedShowController {
  /** 外框文案；详情还没加载到时为 null。 */
  readonly presentation: ShowPresentation | null;
  /** 不能预览的原因（还没有通过评审的场景等）；能预览时为 null。 */
  readonly unavailableReason: string | null;
}

/**
 * 作者的看展预览（/exhibitions/:id/view）：用当前草稿详情 + 最近一次通过评审的场景，
 * 套用与公开页相同的先导页与 3D 游览。作者照片路由需要令牌，所以加载时一次性取回
 * 展示图（≤2048 JPEG）：既作为侧栏 / 大图的本地 object URL，也作为沙箱 ctx.photos。
 * 照片 AI 解读只是氛围增强：取不到时照常预览，只是不显示解读。
 */
export const useDraftPreviewShow = (exhibitionId: string): DraftPreviewController => {
  const [state, dispatch] = useReducer(reducePublicShow, undefined, createInitialPublicShowState);
  const [presentation, setPresentation] = useState<ShowPresentation | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const playingRef = useRef<PublicPlayingScene | null>(null);
  const objectUrlsRef = useRef<readonly string[]>([]);
  const loadAbortRef = useRef<AbortController | null>(null);

  const revokeObjectUrls = (): void => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  };

  const load = useCallback((): void => {
    loadAbortRef.current?.abort();
    revokeObjectUrls();
    playingRef.current = null;
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setUnavailableReason(null);
    dispatch({ type: "load_started" });

    new GetExhibitionAPI(exhibitionId)
      .send()
      .then(async (detail) => {
        if (controller.signal.aborted) return;
        rememberExhibitionScenePalettes([detail]);
        setPresentation(draftPreviewPresentation(detail));
        const check = checkDraftPreview(detail);
        if (check.kind === "unavailable") {
          setUnavailableReason(check.reason);
          dispatch({ type: "load_not_found" });
          return;
        }
        const prepared = await prepareDisplayPhotos(
          draftPhotos(detail).map((photo) => ({ id: photo.id, contentUrl: photo.contentUrl })),
          controller.signal,
        );
        const coverBlob =
          detail.cover.imageUrl.length === 0
            ? null
            : await fetchAuthorizedBlob(detail.cover.imageUrl, controller.signal).catch(() => null);
        const analyses = await new GetPhotoInsightsAPI(exhibitionId)
          .send()
          .then((insights) => insights.analyses)
          .catch(() => []);
        if (controller.signal.aborted) return;

        const imageUrls = new Map(
          prepared.map((photo): [string, string] => [
            photo.id,
            URL.createObjectURL(new Blob([photo.buffer], { type: photo.mimeType })),
          ]),
        );
        const coverUrl =
          coverBlob === null ? (imageUrls.get(check.run.photoIds[0] ?? "") ?? "") : URL.createObjectURL(coverBlob);
        objectUrlsRef.current = [...imageUrls.values(), ...(coverBlob === null ? [] : [coverUrl])];

        const preparedById = new Map(prepared.map((photo): [string, SandboxPhotoTransfer] => [photo.id, photo]));
        playingRef.current = {
          scene: { code: check.code, runtimeVersion: String(RUNTIME_VERSION), generatedAt: check.run.updatedAt },
          photos: check.run.photoIds
            .map((photoId) => preparedById.get(photoId))
            .filter((photo): photo is SandboxPhotoTransfer => photo !== undefined),
        };
        dispatch({
          type: "load_succeeded",
          exhibition: buildDraftPreviewExhibition({ detail, run: check.run, imageUrls, coverUrl, analyses }),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        dispatch({ type: "load_failed", message: describeGalleryError(error) });
      });
  }, [exhibitionId]);

  useEffect(() => {
    load();
    return () => {
      loadAbortRef.current?.abort();
      revokeObjectUrls();
    };
  }, [load]);

  const enter = useCallback((): void => {
    const playing = playingRef.current;
    if (state.status !== "ready" || state.playing !== null || playing === null) return;
    withViewTransition(() => {
      dispatch({ type: "enter_started" });
      dispatch({ type: "enter_succeeded", playing });
    });
  }, [state]);

  const exit = useCallback((): void => withViewTransition(() => dispatch({ type: "exit" }), "scene-exit"), []);

  return { state, enter, exit, retry: load, presentation, unavailableReason };
};
