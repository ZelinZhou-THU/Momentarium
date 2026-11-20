import { useEffect, useState } from "react";
import { GetPhotoInsightsAPI } from "../../../apis/curation/GetPhotoInsightsAPI";
import { describeCurationError } from "../../../apis/curation/describeCurationError";
import { GetExhibitionAPI } from "../../../apis/gallery/GetExhibitionAPI";
import { rememberExhibitionScenePalettes } from "../../../stores/exhibitionPaletteStore";
import { ApiError } from "../../../apis/shared/ApiError";
import { clearSession } from "../../../stores/sessionStore";
import { buildInsightsView } from "../functions/buildInsightsView";
import type { PhotoInsightsState } from "../objects/PhotoInsightsState";

export interface PhotoInsightsModel {
  readonly state: PhotoInsightsState;
  readonly reload: () => void;
}

/** 并行读取展览详情（照片与章节）与照片解读，合并成视图模型；401 清会话。 */
export const usePhotoInsights = (exhibitionId: string): PhotoInsightsModel => {
  const [state, setState] = useState<PhotoInsightsState>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    setState({ status: "loading" });
    Promise.all([new GetExhibitionAPI(exhibitionId).send(), new GetPhotoInsightsAPI(exhibitionId).send()]).then(
      ([detail, insights]) => {
        rememberExhibitionScenePalettes([detail]);
        setState({ status: "ready", view: buildInsightsView(detail, insights) });
      },
      (error: unknown) => {
        if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
          clearSession();
          return;
        }
        setState({ status: "error", message: describeCurationError(error) });
      },
    );
  }, [exhibitionId, reloadCount]);

  return { state, reload: () => setReloadCount((count) => count + 1) };
};
