/** 登录 / 注册页的页面级状态类型（简单表单，用局部 useState，不引入大型联合类型）。 */

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

/** 字段级校验结果：null 表示该字段通过。 */
export interface CredentialErrors {
  readonly username: string | null;
  readonly password: string | null;
}

/** 提交状态：空闲 / 提交中 / 失败（成功即跳转，不保留状态）。 */
export type AuthSubmitState =
  | { readonly status: "idle" }
  | { readonly status: "submitting" }
  | { readonly status: "error"; readonly message: string };
