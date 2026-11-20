import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * 沉浸观看的页面级副作用：锁定页面滚动、Esc 退出、进入/退出时移交键盘焦点。
 * 焦点在场景 iframe 内时 Esc 由沙箱运行时经 postMessage 转发（契约 escape 消息，
 * SceneStage 接到后同样调用退出）；「返回工作台」按钮仍然始终可见作为兜底。
 */
export function useImmersiveScene(
  active: boolean,
  onExit: () => void,
  exitButtonRef: RefObject<HTMLButtonElement | null>,
  entryButtonRef: RefObject<HTMLButtonElement | null>,
): void {
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (active) {
      exitButtonRef.current?.focus();
    } else if (wasActiveRef.current) {
      entryButtonRef.current?.focus();
    }
    wasActiveRef.current = active;
  }, [active, entryButtonRef, exitButtonRef]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onExitRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active]);
}
