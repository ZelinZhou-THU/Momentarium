import { useEffect, useRef, useState } from "react";
import type { ScenePanelStatus } from "../objects/ScenePanelState";

/** 可见性、页面切换与双帧等待集中在边缘；卸载释放 observer/listener/RAF。 */
export const useSceneCaptureVisibility = (status: ScenePanelStatus, captureAttempt: number) => {
  const sectionRef = useRef<HTMLElement>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [captureArmed, setCaptureArmed] = useState(false);
  const [deferNotice, setDeferNotice] = useState<string | null>(null);
  const effectiveVisible = panelVisible && documentVisible;
  const effectiveVisibleRef = useRef(effectiveVisible);
  effectiveVisibleRef.current = effectiveVisible;

  /* 面板可见性：阈值 0.2——过小的可见比例仍可能被浏览器节流，按不可见处理。 */
  useEffect(() => {
    const element = sectionRef.current;
    if (element === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry === undefined) {
          return;
        }
        setPanelVisible(entry.isIntersecting && entry.intersectionRatio >= 0.2);
      },
      { threshold: [0, 0.2, 0.5, 1] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* 页面级可见性（切标签页/最小化同样会使 rAF 暂停）。 */
  useEffect(() => {
    const updateVisibility = () => setDocumentVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  /* 可见后等 2 帧再开始截图：确保 iframe 恢复帧调度、fps 采样恢复正常。 */
  useEffect(() => {
    if (status !== "awaiting_capture" || !effectiveVisible) {
      setCaptureArmed(false);
      return;
    }
    setCaptureArmed(false);
    let cancelled = false;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (!cancelled) {
          setCaptureArmed(true);
          setDeferNotice(null);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [status, captureAttempt, effectiveVisible]);

  return { sectionRef, panelVisible, documentVisible, captureArmed, deferNotice, setDeferNotice, effectiveVisible, effectiveVisibleRef };
};
