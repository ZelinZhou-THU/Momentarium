import { useEffect, useState } from "react";
import { ListContributionsAPI } from "../../../apis/gallery/ListContributionsAPI";
import { describeContributionError } from "../../../apis/gallery/describeContributionError";
import { ApiError } from "../../../apis/shared/ApiError";
import { clearSession } from "../../../stores/sessionStore";
import type { ContributionsLoadState } from "../objects/ContributionsState";

/** 我的投稿数据加载：列表即详情（listcontributions），401 清会话回登录，其余失败给可重试错误态。 */
export const useContributions = () => {
  const [state, setState] = useState<ContributionsLoadState>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    new ListContributionsAPI().send({ signal: controller.signal }).then(
      (response) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", contributions: response.contributions });
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
          clearSession();
          return;
        }
        setState({ status: "error", message: describeContributionError(error) });
      },
    );
    return () => controller.abort();
  }, [reloadCount]);

  return { state, reload: () => setReloadCount((count) => count + 1) };
};
