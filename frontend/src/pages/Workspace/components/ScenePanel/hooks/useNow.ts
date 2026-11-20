import { useEffect, useState } from "react";

/** 当前时刻（毫秒）：active 时每 intervalMs 刷新一次，用于计时文案；不活跃时不起定时器。 */
export const useNow = (active: boolean, intervalMs = 1_000): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);

  return now;
};
