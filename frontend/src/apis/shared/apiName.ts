/**
 * 前端 API 类名 → 后端消息路由名的唯一推导入口（rules 31/53）。
 *
 * 后端规则：路由名 = 消息类名去掉结尾 `Message` 后转小写（`RegisterMessage` → `register`）。
 * 前端 API 类名以 `API` 结尾（`RegisterAPI` 对应后端 `RegisterMessage`），
 * 先还原成消息名，再走同一条规则，保证两侧不靠手工字符串对齐。
 */
const API_CLASS_SUFFIX = "API";
const MESSAGE_SUFFIX = "Message";

const toMessageName = (apiClassName: string): string =>
  apiClassName.endsWith(API_CLASS_SUFFIX)
    ? `${apiClassName.slice(0, -API_CLASS_SUFFIX.length)}${MESSAGE_SUFFIX}`
    : apiClassName;

/** 例：`apiName("RegisterAPI") === apiName("RegisterMessage") === "register"`。 */
export const apiName = (apiClassName: string): string => {
  const messageName = toMessageName(apiClassName);
  const baseName = messageName.endsWith(MESSAGE_SUFFIX)
    ? messageName.slice(0, -MESSAGE_SUFFIX.length)
    : messageName;
  return baseName.toLowerCase();
};
