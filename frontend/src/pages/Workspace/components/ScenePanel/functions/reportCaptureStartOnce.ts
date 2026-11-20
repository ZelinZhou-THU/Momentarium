/** 按运行和轮次只报告一次，未启用自动截图时不记录。 */
export const reportCaptureStartOnce = (
  last: { current: Set<string> },
  autoCapture: boolean,
  runId: string,
  attempt: number,
  report: () => void,
): void => {
  const key = JSON.stringify([runId, attempt]);
  if (!autoCapture || last.current.has(key)) return;
  last.current.add(key);
  report();
};
