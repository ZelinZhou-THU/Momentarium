import { useCallback, useEffect, useRef, useState } from "react";
import { describePlaceSearchError } from "../../../apis/gallery/describePlaceSearchError";
import { SearchPlacesAPI } from "../../../apis/gallery/SearchPlacesAPI";
import type { PlaceSearchState } from "../objects/ContributionLocationFields";

export interface PlaceSearchModel {
  readonly state: PlaceSearchState;
  search(query: string): void;
  clear(): void;
}

/** 地点搜索的请求编排：后一次搜索会取消前一次，卸载时取消未完成的请求。 */
export const usePlaceSearch = (): PlaceSearchModel => {
  const [state, setState] = useState<PlaceSearchState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const search = useCallback((query: string): void => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setState({ status: "error", message: "请输入要搜索的地点名称" });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "searching" });
    new SearchPlacesAPI(trimmed).send({ signal: controller.signal }).then(
      (response) => {
        if (!controller.signal.aborted) {
          setState(
            response.candidates.length === 0
              ? { status: "empty" }
              : { status: "results", candidates: response.candidates },
          );
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: describePlaceSearchError(error) });
        }
      },
    );
  }, []);

  const clear = useCallback((): void => {
    abortRef.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, search, clear };
};
