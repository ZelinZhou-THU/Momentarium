/**
 * 截图请求与运行时证据收集（宿主侧，非沙箱内执行）。
 *
 * 对应 spec §9.4/§9.5：每个场景会话采集 4 个视角的 JPEG 截图与 RuntimeEvidence；
 * 服务端硬门禁是最终判据，这里提供客户端侧的同构预检，让页面在提交评审前就能
 * 区分"渲染失败/证据不合格/可提交"。
 */
import type {
  CapturesMessage,
  CaptureRequestMessage,
  CaptureView,
  ImageCapture,
  RuntimeEvidence,
} from "./contract";
import {
  CAPTURE_LIMITS,
  CAPTURE_VIEWS,
  JPEG_DATA_URL_PREFIX,
  RUNTIME_VERSION,
} from "./contract";

/** 截图视角的展示文案（与 CAPTURE_VIEWS 一一对应，用于预览与证据命名）。 */
export const CAPTURE_VIEW_LABELS: readonly string[] = ["初始视角", "方位角 +90°", "方位角 +180°（背面）", "方位角 +270°"];

/** 构造截图请求消息；默认视角为 spec §9.4 的"初始视角 + 方位角 90°/180°/270°"。 */
export const createCaptureRequest = (
  runId: string,
  requestId: string,
  views: readonly CaptureView[] = CAPTURE_VIEWS,
): CaptureRequestMessage => ({
  type: "capture",
  runId,
  requestId,
  views: [...views],
});

/** JPEG data URL 的字节数估算（base64 长度换算，不真正解码）。 */
export const estimateDataUrlBytes = (dataUrl: string): number => {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return 0;
  const base64 = dataUrl.slice(commaIndex + 1);
  if (base64.length === 0) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

export const isJpegDataUrl = (value: string): boolean => value.startsWith(JPEG_DATA_URL_PREFIX);

/** 客户端预检失败项；服务端硬门禁的 code 与语义以 spec §9.5 为准。 */
export type CaptureAuditCode =
  | "RUNTIME_VERSION_MISMATCH"
  | "RUNTIME_ERRORS"
  | "NETWORK_ATTEMPTS"
  | "CAPTURE_COUNT"
  | "CAPTURE_NOT_JPEG"
  | "CAPTURE_TOO_LARGE"
  | "CAPTURE_TOO_WIDE"
  | "FPS_UNAVAILABLE"
  | "FPS_TOO_LOW";

export interface CaptureAuditIssue {
  readonly code: CaptureAuditCode;
  readonly message: string;
}

export interface CaptureAudit {
  readonly passed: boolean;
  readonly issues: readonly CaptureAuditIssue[];
}

export interface CaptureCollection {
  readonly captures: readonly ImageCapture[];
  readonly runtime: RuntimeEvidence;
  readonly audit: CaptureAudit;
}

const MIN_FPS = 20;

const auditCaptures = (captures: readonly ImageCapture[]): CaptureAuditIssue[] => {
  const issues: CaptureAuditIssue[] = [];
  if (captures.length !== CAPTURE_LIMITS.expectedCount) {
    issues.push({
      code: "CAPTURE_COUNT",
      message: `需要 ${CAPTURE_LIMITS.expectedCount} 张截图，实际 ${captures.length} 张`,
    });
  }
  for (const capture of captures) {
    const label = CAPTURE_VIEW_LABELS[capture.index] ?? `视角 ${capture.index}`;
    if (!isJpegDataUrl(capture.dataUrl)) {
      issues.push({ code: "CAPTURE_NOT_JPEG", message: `${label} 不是 JPEG data URL` });
    }
    const bytes = estimateDataUrlBytes(capture.dataUrl);
    if (bytes > CAPTURE_LIMITS.maxBytesPerImage) {
      issues.push({ code: "CAPTURE_TOO_LARGE", message: `${label} 超过 2MB（${bytes} 字节）` });
    }
    if (capture.width > CAPTURE_LIMITS.maxWidth) {
      issues.push({ code: "CAPTURE_TOO_WIDE", message: `${label} 宽度 ${capture.width}px 超过 1600px` });
    }
  }
  return issues;
};

const auditRuntime = (runtime: RuntimeEvidence): CaptureAuditIssue[] => {
  const issues: CaptureAuditIssue[] = [];
  if (runtime.runtimeVersion !== RUNTIME_VERSION) {
    issues.push({
      code: "RUNTIME_VERSION_MISMATCH",
      message: `runtimeVersion ${runtime.runtimeVersion} 与前端契约 ${RUNTIME_VERSION} 不一致`,
    });
  }
  if (runtime.errors.length > 0) {
    issues.push({ code: "RUNTIME_ERRORS", message: `运行时错误 ${runtime.errors.length} 条` });
  }
  // 纯场景（D7）：场景不再陈列照片，生成代码可以不使用 photos（沙箱仍传给 ctx 兼容旧代码），
  // 因此"照片是否被使用"不再作为客户端预检项；旧场景使用照片也照常渲染。
  if (runtime.networkAttempts > 0) {
    issues.push({ code: "NETWORK_ATTEMPTS", message: `禁止联网，检测到 ${runtime.networkAttempts} 次尝试` });
  }
  if (runtime.fps === null) {
    issues.push({ code: "FPS_UNAVAILABLE", message: "未采集到 fps（帧数不足）" });
  } else if (runtime.fps < MIN_FPS) {
    issues.push({ code: "FPS_TOO_LOW", message: `fps ${runtime.fps} 低于最低 ${MIN_FPS}` });
  }
  return issues;
};

/** 客户端硬门禁预检：与 spec §9.5 同构（纯场景已移除照片使用项）；服务端复核才是最终判据。 */
export const auditSceneCapture = (
  captures: readonly ImageCapture[],
  runtime: RuntimeEvidence,
): CaptureAudit => {
  const issues = [...auditCaptures(captures), ...auditRuntime(runtime)];
  return { passed: issues.length === 0, issues };
};

/** 把一次 capture 回复整理为"截图 + 运行时证据 + 预检结果"，供评审提交与页面状态使用。 */
export const collectSceneCapture = (message: CapturesMessage): CaptureCollection => ({
  captures: message.images,
  runtime: message.runtime,
  audit: auditSceneCapture(message.images, message.runtime),
});
