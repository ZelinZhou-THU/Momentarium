/** 站点首页能落到的两个并列空间。 */
export type HomePath = "/exhibitions" | "/contributions";

/** 首页落点判定状态：loading / resolved（带最终路径）；读取失败也会落回「我的展览」，由它自己展示错误。 */
export type HomeDestinationState =
  | { readonly status: "loading" }
  | { readonly status: "resolved"; readonly path: HomePath };
