/** 截图是本地操作；超时后保留后端运行，由用户决定何时重试。 */
export const CAPTURE_TIMEOUT_MS = 30_000;

export const scheduleCaptureTimeout = (onTimeout: () => void): (() => void) => {
  const timer = window.setTimeout(onTimeout, CAPTURE_TIMEOUT_MS);
  return () => window.clearTimeout(timer);
};
