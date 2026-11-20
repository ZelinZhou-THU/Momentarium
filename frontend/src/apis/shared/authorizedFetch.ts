import { getSessionToken } from "../../stores/sessionStore";

/**
 * 作者态二进制请求：照片内容 / 封面等路由需要 Bearer 令牌，`<img src>`/直接 fetch 不带头部，
 * 统一从这里带令牌取 Blob（useAuthorizedImage 与场景沙箱的展示图取字节共用）。
 */
export const fetchAuthorizedBlob = async (url: string, signal?: AbortSignal): Promise<Blob> => {
  const token = getSessionToken();
  const response = await fetch(url, {
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) {
    throw new Error(`受保护资源请求失败：${response.status}`);
  }
  return response.blob();
};
