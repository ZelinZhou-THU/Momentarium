import { useEffect, useState } from "react";
import { GetAuthorPageAPI } from "../../../apis/gallery/GetAuthorPageAPI";
import { rememberExhibitionScenePalettes } from "../../../stores/exhibitionPaletteStore";
import { ApiError } from "../../../apis/shared/ApiError";
import { describeApiError } from "../../../apis/shared/describeApiError";
import type { AuthorHomeState } from "../objects/AuthorHomeState";

export interface AuthorPageModel {
  readonly state: AuthorHomeState;
  readonly reload: () => void;
}

/** 公开读取作者主页（不带令牌）；404 统一为 notFound，离开页面时中止请求。 */
export const useAuthorPage = (username: string): AuthorPageModel => {
  const [state, setState] = useState<AuthorHomeState>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    new GetAuthorPageAPI(username).send({ signal: controller.signal }).then(
      (page) => {
        rememberExhibitionScenePalettes(page.exhibitions);
        setState({ status: "ready", page });
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState(
          error instanceof ApiError && error.code === "NOT_FOUND"
            ? { status: "notFound" }
            : { status: "error", message: describeApiError(error, {}) },
        );
      },
    );
    return () => controller.abort();
  }, [username, reloadCount]);

  return { state, reload: () => setReloadCount((count) => count + 1) };
};
