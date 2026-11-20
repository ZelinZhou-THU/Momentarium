import { useEffect, useState } from "react";
import { ListContributionsAPI } from "../../../apis/gallery/ListContributionsAPI";
import { groupContributionsByExhibition } from "../../Contributions/functions/contributionGroups";

/**
 * 我参与过多少场别人的展览（按投稿所在展览去重）；仅在 enabled 时读取。
 * 只服务于「空馆」页的一句指路，读取失败就当作 0，不打断主流程（错误由「我参与的」页自己展示）。
 */
export const useParticipatedExhibitionCount = (enabled: boolean): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const controller = new AbortController();
    new ListContributionsAPI().send({ signal: controller.signal }).then(
      (response) => {
        if (!controller.signal.aborted) {
          setCount(groupContributionsByExhibition(response.contributions).length);
        }
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [enabled]);

  return count;
};
