import { useEffect, useState } from "react";

/** 开场字幕至少停留的时间：挂载后经过 holdMs 才返回 true（场景再快也让观众读完标题）。 */
export function useOpeningHold(holdMs: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setElapsed(true), holdMs);
    return () => window.clearTimeout(timer);
  }, [holdMs]);
  return elapsed;
}
