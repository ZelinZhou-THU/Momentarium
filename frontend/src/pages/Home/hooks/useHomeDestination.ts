import { useEffect, useState } from "react";
import { ListContributionsAPI } from "../../../apis/gallery/ListContributionsAPI";
import { ListMyExhibitionsAPI } from "../../../apis/gallery/ListMyExhibitionsAPI";
import { ApiError } from "../../../apis/shared/ApiError";
import { clearSession } from "../../../stores/sessionStore";
import { chooseHomePath } from "../functions/chooseHomePath";
import type { HomeDestinationState } from "../objects/HomeDestination";

/**
 * 读取展览数与参与记录数，决定首页落点；401 清会话交给受保护路由跳登录，
 * 其他失败一律落回「我的展览」（那里有自己的错误与重试展示）。
 */
export const useHomeDestination = (): HomeDestinationState => {
  const [state, setState] = useState<HomeDestinationState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      new ListMyExhibitionsAPI().send(),
      new ListContributionsAPI().send({ signal: controller.signal }),
    ]).then(
      ([exhibitions, contributions]) => {
        if (!controller.signal.aborted) {
          setState({
            status: "resolved",
            path: chooseHomePath(exhibitions.exhibitions.length, contributions.contributions.length),
          });
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
        setState({ status: "resolved", path: "/exhibitions" });
      },
    );
    return () => controller.abort();
  }, []);

  return state;
};
