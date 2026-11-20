import { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import type { Blocker } from "react-router-dom";

/**
 * 未保存修改离开保护：
 * - 站内跳转到其它页面（路径变化）时拦截，交给调用方弹确认框（同页切换分区只改 ?tab=，不拦截）；
 * - 刷新 / 关闭标签页由浏览器原生 beforeunload 提示兜底。
 */
export const useUnsavedChangesGuard = (isDirty: boolean): Blocker => {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  return blocker;
};
