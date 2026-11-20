import type { UploadProgress } from "../../../apis/shared/send";

/** 上传中的展示：阶段文案 + 进度百分比（服务端处理阶段没有可观测进度，percent 为 null）。 */
export interface UploadProgressView {
  readonly phase: "sending" | "processing";
  readonly label: string;
  /** 0–100 的整数；处理阶段为 null（不展示虚构进度）。 */
  readonly percent: number | null;
}

const MEGABYTE = 1024 * 1024;

export const formatMegabytes = (bytes: number): string => `${(bytes / MEGABYTE).toFixed(1)} MB`;

/**
 * 只展示浏览器真实可观测的数据：请求体发送进度来自 XHR upload 事件；发送完到接口返回之间是
 * 服务端逐张校正方向、生成缩略图，这段没有进度回报，只说明阶段，不编百分比。
 */
export const describeUploadProgress = (
  fileCount: number,
  fileBytes: number,
  progress: UploadProgress | null,
): UploadProgressView => {
  const total = `${fileCount} 张照片（共 ${formatMegabytes(fileBytes)}）`;
  if (progress !== null && progress.totalBytes > 0 && progress.loadedBytes >= progress.totalBytes) {
    return {
      phase: "processing",
      label: `${fileCount} 张照片已送达，服务器正在逐张校正方向、生成缩略图…`,
      percent: null,
    };
  }
  const percent =
    progress === null || progress.totalBytes <= 0
      ? 0
      : Math.min(99, Math.floor((progress.loadedBytes / progress.totalBytes) * 100));
  const sent = progress === null ? "" : ` · 已发送 ${formatMegabytes(progress.loadedBytes)}`;
  return { phase: "sending", label: `正在上传 ${total}${sent}`, percent };
};
