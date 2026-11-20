import type { HomePath } from "../objects/HomeDestination";

/**
 * 首页落点：有自己的展览去「我的展览」；一个展览都没有、但参与过别人的展览，去「我参与的」；
 * 两者都没有保持「我的展览」（空馆引导新建）。
 */
export const chooseHomePath = (exhibitionCount: number, contributionCount: number): HomePath =>
  exhibitionCount === 0 && contributionCount > 0 ? "/contributions" : "/exhibitions";
