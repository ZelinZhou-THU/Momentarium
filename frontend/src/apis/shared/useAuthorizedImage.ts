import { useEffect, useState } from "react";
import { acquireAuthorizedImage } from "./authorizedImageCache";

export interface AuthorizedImageState {
  readonly status: "loading" | "ready" | "error";
  readonly objectUrl: string | null;
}

const LOADING: AuthorizedImageState = { status: "loading", objectUrl: null };
const FAILED: AuthorizedImageState = { status: "error", objectUrl: null };

/**
 * 作者态受保护图片（照片内容 / 封面 / 投稿图）加载：经共享缓存（authorizedImageCache）带 Bearer 取图，
 * 同一令牌下相同 URL 的所有组件共用一次下载与一个 objectURL；引用归零后延迟释放。
 * 内容可变的图片请由调用方把版本号拼进 URL（封面 `?v=`、投稿 `&v=`）以得到新条目。
 * 公开页（D6）匿名可读的图片不走本 hook，直接用 URL。
 */
export const useAuthorizedImage = (url: string): AuthorizedImageState => {
  const [state, setState] = useState<AuthorizedImageState>(LOADING);

  useEffect(() => {
    if (url.length === 0) {
      setState(FAILED);
      return;
    }

    const lease = acquireAuthorizedImage(url);
    const cached = lease.peek();
    setState(cached === null ? LOADING : { status: "ready", objectUrl: cached });

    // 取消标记放进对象，避免可变局部变量。
    const subscription = { active: true };
    lease.ready
      .then((objectUrl) => subscription.active && setState({ status: "ready", objectUrl }))
      .catch(() => subscription.active && setState(FAILED));

    return () => {
      subscription.active = false;
      lease.release();
    };
  }, [url]);

  return state;
};
