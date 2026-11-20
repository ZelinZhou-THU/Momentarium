import { useEffect, useState } from "react";

const browserOnline = (): boolean => (typeof navigator === "undefined" ? true : navigator.onLine);

/** 浏览器在线状态（共享地图基础设施）：离线时地图区域只做提示，不阻断列表与编辑。 */
export const useOnlineStatus = (): boolean => {
  const [online, setOnline] = useState(browserOnline);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleOnline = (): void => setOnline(true);
    const handleOffline = (): void => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
};
