import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export interface InViewportState {
  readonly ref: RefObject<HTMLDivElement | null>;
  /** 是否已经进入（或接近）视口；进入后保持为 true，避免滚动抖动重复加载。 */
  readonly inView: boolean;
}

/**
 * 元素是否接近视口（作者主页足迹地图在展览卡片之后，用它在滚动到附近时才加载地图库与瓦片，
 * 避免首屏就请求外部瓦片）。不支持 IntersectionObserver 的环境直接视为可见。
 */
export const useInViewport = (rootMargin = "200px 0px"): InViewportState => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const node = ref.current;
    if (node === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
};
