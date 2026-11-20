import { flushSync } from "react-dom";

/**
 * 过渡的类型（CSS 里用 :active-view-transition-type 按类型匹配，见 index.css）：
 * 进入场景整页向前推进（先导页放大淡出、场景由小放大淡入），退出场景反向。
 */
export type ViewTransitionKind = "scene-enter" | "scene-exit";

const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const supportsTransitionTypes = (): boolean => typeof ViewTransition !== "undefined" && "types" in ViewTransition.prototype;

/**
 * 把一次界面状态更新包进浏览器的 View Transition：旧画面与新画面交叉渐变，
 * 带同名 view-transition-name 的元素（如照片）在两者之间补间位置与尺寸。
 * 不支持该 API 或用户要求减少动效时直接更新，不做任何动画。
 * 用于页面内的状态切换（进入/退出场景、打开/关闭大图）；路由跳转用 react-router 的 viewTransition。
 * 传 kind 时给过渡打上类型，浏览器不支持类型就退回默认的交叉渐变。
 */
export const withViewTransition = (update: () => void, kind?: ViewTransitionKind): void => {
  if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) {
    update();
    return;
  }
  const flushed = (): void => flushSync(update);
  if (kind !== undefined && supportsTransitionTypes()) {
    document.startViewTransition({ update: flushed, types: [kind] });
    return;
  }
  document.startViewTransition(flushed);
};
