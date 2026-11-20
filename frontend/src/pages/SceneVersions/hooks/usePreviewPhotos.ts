import { useEffect, useState } from "react";
import { GetExhibitionAPI } from "../../../apis/gallery/GetExhibitionAPI";
import type { SandboxPhotoTransfer } from "../../../scene/contract";
import { prepareDisplayPhotos } from "../../../scene/photoDisplay";
import { rememberExhibitionScenePalettes } from "../../../stores/exhibitionPaletteStore";
import type { PreviewPhotosState } from "../objects/SceneVersionsState";

/**
 * 预览沙箱需要的展示图：运行时为兼容旧代码要求 ctx.photos 非空（纯场景代码不会使用）。
 * 按当前草稿照片准备一次，全部版本共用；沙箱 init 时会复制 buffer，不会被 detach。
 */
export const usePreviewPhotos = (exhibitionId: string): PreviewPhotosState => {
  const [state, setState] = useState<PreviewPhotosState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    new GetExhibitionAPI(exhibitionId)
      .send()
      .then((detail) => {
        rememberExhibitionScenePalettes([detail]);
        return prepareDisplayPhotos(
          [...detail.groups.flatMap((group) => group.photos), ...detail.ungroupedPhotos].map((photo) => ({
            id: photo.id,
            contentUrl: photo.contentUrl,
          })),
          controller.signal,
        );
      })
      .then(
        (photos: readonly SandboxPhotoTransfer[]) => {
          if (!controller.signal.aborted) {
            setState(
              photos.length === 0
                ? { status: "unavailable", message: "展览里没有照片，无法在沙箱中预览场景。" }
                : { status: "ready", photos },
            );
          }
        },
        () => {
          if (!controller.signal.aborted) {
            setState({ status: "unavailable", message: "照片读取失败，暂时无法预览场景。" });
          }
        },
      );
    return () => controller.abort();
  }, [exhibitionId]);

  return state;
};
