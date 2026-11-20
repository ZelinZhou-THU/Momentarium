/**
 * 三维场景沙箱契约（runtimeVersion = 1）。
 *
 * 父页面（React）与沙箱 iframe 内的 SceneRuntime 只能通过 postMessage 交换这里定义的
 * 消息；iframe 内部实现见 runtime.ts，iframe 外的组装/生命周期见 sandbox.tsx。
 * 任何字段变化必须同时改 runtime.ts 与 prototypes/three/README.md，并递增 RUNTIME_VERSION。
 *
 * 设计约束（与 prototypes/three 原型结论一致）：
 *  - 照片以 ArrayBuffer transfer 进沙箱，父页面不把图片 URL 交给沙箱；
 *  - 生成代码只以字符串形式经 init 进入沙箱，绝不进入 React/业务数据；
 *  - 解码按 docs/specification.md §9.5 的硬门禁所需字段逐项收窄（无 any、无 as）。
 */
import {
  DecodeError,
  requireArray,
  requireBoolean,
  requireNumber,
  requireObject,
  requireNullable,
  requireString,
} from "../apis/shared/decode";

/** 沙箱 iframe 只允许脚本执行：不开放同源、弹窗、表单与顶层导航（spec §9.4）。 */
export const SANDBOX_IFRAME_SANDBOX = "allow-scripts";

/** 写入 srcdoc 的 CSP；顺序与取值来自 spec §9.4，改动需同步 prototypes/three/README.md。 */
export const SANDBOX_CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none';";

/** ctx 契约版本；每次不兼容变更递增，服务端硬门禁会校验（spec §9.5）。 */
export const RUNTIME_VERSION = 1;

/** 父页面等待 built 的上限：原型实测父页面 watchdog 可在 sandbox 阻塞时按时触发。 */
export const BUILD_TIMEOUT_MS = 8_000;
/** 单次渲染会话上限；到点销毁 iframe。 */
export const SESSION_LIMIT_MS = 90_000;
/** 等待 iframe srcdoc 解析完成的上限。 */
export const FRAME_LOAD_TIMEOUT_MS = 10_000;
/** 等待 captures 回复的上限（截图本身毫秒级，留足低端机余量）。 */
export const CAPTURE_TIMEOUT_MS = 15_000;
/** 展示图降采样上限：长边 ≤2048，JPEG 0.82（spec §9.4）。 */
export const DISPLAY_MAX_EDGE = 2048;
export const DISPLAY_JPEG_QUALITY = 0.82;
/** 生成代码上限（SCENE_CODE_LIMIT_KB 默认 1024KB，spec §9.3）。 */
export const SCENE_CODE_LIMIT_BYTES = 1024 * 1024;
/** 截图硬门禁：4 张（正面 + 三个环绕视角）、JPEG data URL、每张 ≤2MB、宽度 ≤1600px（spec §9.4/§9.5）。 */
export const CAPTURE_LIMITS = {
  expectedCount: 4,
  maxBytesPerImage: 2 * 1024 * 1024,
  maxWidth: 1600,
} as const;
export const JPEG_DATA_URL_PREFIX = "data:image/jpeg;base64,";

/** 评审截图视角：初始视角（保持 build 后的相机）+ 绕 orbit target 的方位角 90°/180°/270°（环绕一圈，背面也要被看到）。 */
export const CAPTURE_VIEWS: readonly CaptureView[] = [
  { azimuthDeg: 0, elevationDeg: 0 },
  { azimuthDeg: 90, elevationDeg: 0 },
  { azimuthDeg: 180, elevationDeg: 0 },
  { azimuthDeg: 270, elevationDeg: 0 },
];

/** SceneRuntime 目前会回传的错误码；runtime.ts 内联实现必须与之一致（测试会断言同步）。 */
export const SANDBOX_ERROR_CODES = [
  "WEBGL_UNAVAILABLE",
  "CODE_INVALID",
  "BUILD_FAILED",
  "TEXTURE_LOAD_FAILED",
  "PHOTOS_INVALID",
  "RUNTIME_VERSION_MISMATCH",
  "SESSION_ALREADY_INITIALIZED",
  "NOT_READY",
  "CAPTURE_BUSY",
  "CAPTURE_TAINTED",
  "CAPTURE_FAILED",
  "RUNTIME_FAILED",
] as const;
export type SandboxErrorCode = (typeof SANDBOX_ERROR_CODES)[number];

/* -------------------------------------------------------------------------- */
/* 父页面 -> 沙箱                                                              */
/* -------------------------------------------------------------------------- */

export interface SandboxPhotoTransfer {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  readonly mimeType: string;
  /** 展示图 JPEG 字节；postMessage 时放入 transfer list（发送后父页面侧 detach）。 */
  readonly buffer: ArrayBuffer;
}

export interface SandboxLimits {
  readonly buildTimeoutMs: number;
  readonly sessionLimitMs: number;
}

export interface InitMessage {
  readonly type: "init";
  readonly runId: string;
  readonly runtimeVersion: number;
  readonly photos: readonly SandboxPhotoTransfer[];
  readonly code: string;
  readonly limits: SandboxLimits;
}

export interface CaptureRequestMessage {
  readonly type: "capture";
  readonly runId: string;
  readonly requestId: string;
  readonly views: readonly CaptureView[];
}

export type ParentToSandboxMessage = InitMessage | CaptureRequestMessage;

export interface CaptureView {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
}

/* -------------------------------------------------------------------------- */
/* 沙箱 -> 父页面                                                              */
/* -------------------------------------------------------------------------- */

export interface BuiltMessage {
  readonly type: "built";
  readonly runId: string;
  readonly runtimeVersion: number;
  readonly buildMs: number;
  readonly texturesMs: number | null;
  readonly firstFrameMs: number | null;
  readonly photoCount: number;
}

export interface RuntimeErrorEntry {
  readonly phase: string;
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
  readonly atMs: number;
}

export interface NetworkAttempt {
  readonly kind: string;
  readonly url: string;
  readonly atMs: number;
}

export interface CspViolation {
  readonly directive: string;
  readonly blockedUri: string;
  readonly atMs: number;
}

export interface WebGlInfo {
  readonly version: string;
  readonly renderer: string;
  readonly vendor: string;
  readonly maxTextureSize: number;
}

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface DrawStats {
  readonly calls: number;
  readonly triangles: number;
  readonly points: number;
}

/** 运行时证据：客户端自证，仅用于 AI 评审与质量判断（spec §9.4 信任模型）。 */
export interface RuntimeEvidence {
  readonly runtimeVersion: number;
  readonly buildMs: number | null;
  readonly texturesMs: number | null;
  readonly firstFrameMs: number | null;
  readonly fps: number | null;
  readonly errors: readonly RuntimeErrorEntry[];
  readonly photoIdsUsed: readonly string[];
  readonly photoCount: number;
  readonly networkAttempts: number;
  readonly networkAttemptDetails: readonly NetworkAttempt[];
  readonly cspViolations: readonly CspViolation[];
  readonly framesRendered: number;
  readonly canvas: CanvasSize;
  readonly drawStats: DrawStats;
  readonly webgl: WebGlInfo;
  readonly orbitControls: boolean;
  readonly sessionElapsedMs: number;
}

export interface ImageCapture {
  readonly view: CaptureView;
  readonly index: number;
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export interface CapturesMessage {
  readonly type: "captures";
  readonly runId: string;
  readonly requestId: string;
  readonly runtimeVersion: number;
  readonly images: readonly ImageCapture[];
  readonly runtime: RuntimeEvidence;
}

export interface SandboxErrorMessage {
  readonly type: "error";
  readonly requestId?: string;
  readonly runId: string;
  readonly code: SandboxErrorCode;
  readonly phase: string;
  readonly message: string;
  readonly errors: readonly RuntimeErrorEntry[];
}

export interface PhotoSelectedMessage {
  readonly type: "photoselected";
  readonly runId: string;
  readonly photoId: string;
}

/**
 * 焦点在沙箱 iframe 内按下 Esc（UI-05）：跨源 iframe 的按键不会传到父页面，由运行时转发。
 * 纯宿主 UI 通知，不涉及 ctx / 评审证据契约，两侧同时发布即兼容，无需递增 RUNTIME_VERSION。
 */
export interface EscapeMessage {
  readonly type: "escape";
  readonly runId: string;
}

export type SandboxToParentMessage =
  | BuiltMessage
  | CapturesMessage
  | SandboxErrorMessage
  | PhotoSelectedMessage
  | EscapeMessage;

/* -------------------------------------------------------------------------- */
/* 解码：结构不符一律抛 DecodeError，由调用方转成错误态（不静默猜测）          */
/* -------------------------------------------------------------------------- */

const parsePositiveNumber = (value: unknown, path: string): number => {
  const parsed = requireNumber(value, path);
  if (parsed <= 0) {
    throw new DecodeError(path);
  }
  return parsed;
};

const parseCaptureView = (value: unknown, path: string): CaptureView => {
  const record = requireObject(value, path);
  return {
    azimuthDeg: requireNumber(record.azimuthDeg, `${path}.azimuthDeg`),
    elevationDeg: requireNumber(record.elevationDeg, `${path}.elevationDeg`),
  };
};

const parseStringOrNull = (value: unknown, path: string): string | null =>
  requireNullable(value, path, requireString);

const parseRuntimeErrorEntry = (value: unknown, path: string): RuntimeErrorEntry => {
  const record = requireObject(value, path);
  return {
    phase: requireString(record.phase, `${path}.phase`),
    name: requireString(record.name, `${path}.name`),
    message: requireString(record.message, `${path}.message`),
    stack: parseStringOrNull(record.stack, `${path}.stack`),
    atMs: requireNumber(record.atMs, `${path}.atMs`),
  };
};

const parseNetworkAttempt = (value: unknown, path: string): NetworkAttempt => {
  const record = requireObject(value, path);
  return {
    kind: requireString(record.kind, `${path}.kind`),
    url: requireString(record.url, `${path}.url`),
    atMs: requireNumber(record.atMs, `${path}.atMs`),
  };
};

const parseCspViolation = (value: unknown, path: string): CspViolation => {
  const record = requireObject(value, path);
  return {
    directive: requireString(record.directive, `${path}.directive`),
    blockedUri: requireString(record.blockedUri, `${path}.blockedUri`),
    atMs: requireNumber(record.atMs, `${path}.atMs`),
  };
};

const parseWebGlInfo = (value: unknown, path: string): WebGlInfo => {
  const record = requireObject(value, path);
  return {
    version: requireString(record.version, `${path}.version`),
    renderer: requireString(record.renderer, `${path}.renderer`),
    vendor: requireString(record.vendor, `${path}.vendor`),
    maxTextureSize: parsePositiveNumber(record.maxTextureSize, `${path}.maxTextureSize`),
  };
};

const parseCanvasSize = (value: unknown, path: string): CanvasSize => {
  const record = requireObject(value, path);
  return {
    width: parsePositiveNumber(record.width, `${path}.width`),
    height: parsePositiveNumber(record.height, `${path}.height`),
  };
};

const parseDrawStats = (value: unknown, path: string): DrawStats => {
  const record = requireObject(value, path);
  return {
    calls: requireNumber(record.calls, `${path}.calls`),
    triangles: requireNumber(record.triangles, `${path}.triangles`),
    points: requireNumber(record.points, `${path}.points`),
  };
};

const parseRuntimeEvidence = (value: unknown): RuntimeEvidence => {
  const record = requireObject(value, "message.runtime");
  return {
    runtimeVersion: requireNumber(record.runtimeVersion, "message.runtime.runtimeVersion"),
    buildMs: requireNullable(record.buildMs, "message.runtime.buildMs", requireNumber),
    texturesMs: requireNullable(record.texturesMs, "message.runtime.texturesMs", requireNumber),
    firstFrameMs: requireNullable(record.firstFrameMs, "message.runtime.firstFrameMs", requireNumber),
    fps: requireNullable(record.fps, "message.runtime.fps", requireNumber),
    errors: requireArray(record.errors, "message.runtime.errors").map((entry, index) =>
      parseRuntimeErrorEntry(entry, `message.runtime.errors[${index}]`),
    ),
    photoIdsUsed: requireArray(record.photoIdsUsed, "message.runtime.photoIdsUsed").map((id, index) =>
      requireString(id, `message.runtime.photoIdsUsed[${index}]`),
    ),
    photoCount: requireNumber(record.photoCount, "message.runtime.photoCount"),
    networkAttempts: requireNumber(record.networkAttempts, "message.runtime.networkAttempts"),
    networkAttemptDetails: requireArray(
      record.networkAttemptDetails,
      "message.runtime.networkAttemptDetails",
    ).map((attempt, index) => parseNetworkAttempt(attempt, `message.runtime.networkAttemptDetails[${index}]`)),
    cspViolations: requireArray(record.cspViolations, "message.runtime.cspViolations").map(
      (violation, index) => parseCspViolation(violation, `message.runtime.cspViolations[${index}]`),
    ),
    framesRendered: requireNumber(record.framesRendered, "message.runtime.framesRendered"),
    canvas: parseCanvasSize(record.canvas, "message.runtime.canvas"),
    drawStats: parseDrawStats(record.drawStats, "message.runtime.drawStats"),
    webgl: parseWebGlInfo(record.webgl, "message.runtime.webgl"),
    orbitControls: requireBoolean(record.orbitControls, "message.runtime.orbitControls"),
    sessionElapsedMs: requireNumber(record.sessionElapsedMs, "message.runtime.sessionElapsedMs"),
  };
};

const parseImageCapture = (value: unknown, path: string): ImageCapture => {
  const record = requireObject(value, path);
  const dataUrl = requireString(record.dataUrl, `${path}.dataUrl`);
  if (!dataUrl.startsWith(JPEG_DATA_URL_PREFIX)) {
    throw new DecodeError(`${path}.dataUrl`);
  }
  return {
    view: parseCaptureView(record.view, `${path}.view`),
    index: requireNumber(record.index, `${path}.index`),
    dataUrl,
    width: parsePositiveNumber(record.width, `${path}.width`),
    height: parsePositiveNumber(record.height, `${path}.height`),
  };
};

const parseSandboxErrorCode = (value: unknown, path: string): SandboxErrorCode => {
  const code = requireString(value, path);
  const matched = SANDBOX_ERROR_CODES.find((candidate) => candidate === code);
  if (!matched) {
    throw new DecodeError(path);
  }
  return matched;
};

const parseBuiltMessage = (record: Record<string, unknown>): BuiltMessage => ({
  type: "built",
  runId: requireString(record.runId, "message.runId"),
  runtimeVersion: requireNumber(record.runtimeVersion, "message.runtimeVersion"),
  buildMs: requireNumber(record.buildMs, "message.buildMs"),
  texturesMs: requireNullable(record.texturesMs, "message.texturesMs", requireNumber),
  firstFrameMs: requireNullable(record.firstFrameMs, "message.firstFrameMs", requireNumber),
  photoCount: requireNumber(record.photoCount, "message.photoCount"),
});

const parseCapturesMessage = (record: Record<string, unknown>): CapturesMessage => ({
  type: "captures",
  runId: requireString(record.runId, "message.runId"),
  requestId: requireString(record.requestId, "message.requestId"),
  runtimeVersion: requireNumber(record.runtimeVersion, "message.runtimeVersion"),
  images: requireArray(record.images, "message.images").map((image, index) =>
    parseImageCapture(image, `message.images[${index}]`),
  ),
  runtime: parseRuntimeEvidence(record.runtime),
});

const parseSandboxErrorMessage = (record: Record<string, unknown>): SandboxErrorMessage => ({
  type: "error",
  ...(record.requestId === undefined ? {} : { requestId: requireString(record.requestId, "message.requestId") }),
  runId: requireString(record.runId, "message.runId"),
  code: parseSandboxErrorCode(record.code, "message.code"),
  phase: requireString(record.phase, "message.phase"),
  message: requireString(record.message, "message.message"),
  errors: requireArray(record.errors, "message.errors").map((entry, index) =>
    parseRuntimeErrorEntry(entry, `message.errors[${index}]`),
  ),
});

const parsePhotoSelectedMessage = (record: Record<string, unknown>): PhotoSelectedMessage => ({
  type: "photoselected",
  runId: requireString(record.runId, "message.runId"),
  photoId: requireString(record.photoId, "message.photoId"),
});

const parseEscapeMessage = (record: Record<string, unknown>): EscapeMessage => ({
  type: "escape",
  runId: requireString(record.runId, "message.runId"),
});

/** 解码沙箱回传消息：字段不符抛 DecodeError（非法消息不得进入评审/状态机）。 */
export const parseSandboxMessage = (value: unknown): SandboxToParentMessage => {
  const record = requireObject(value, "message");
  const type = requireString(record.type, "message.type");
  switch (type) {
    case "built":
      return parseBuiltMessage(record);
    case "captures":
      return parseCapturesMessage(record);
    case "error":
      return parseSandboxErrorMessage(record);
    case "photoselected":
      return parsePhotoSelectedMessage(record);
    case "escape":
      return parseEscapeMessage(record);
    default:
      throw new DecodeError("message.type");
  }
};

const parseSandboxPhotoTransfer = (value: unknown, path: string): SandboxPhotoTransfer => {
  const record = requireObject(value, path);
  if (!(record.buffer instanceof ArrayBuffer)) {
    throw new DecodeError(`${path}.buffer`);
  }
  return {
    id: requireString(record.id, `${path}.id`),
    width: parsePositiveNumber(record.width, `${path}.width`),
    height: parsePositiveNumber(record.height, `${path}.height`),
    aspect: parsePositiveNumber(record.aspect, `${path}.aspect`),
    mimeType: requireString(record.mimeType, `${path}.mimeType`),
    buffer: record.buffer,
  };
};

const parseSandboxLimits = (value: unknown): SandboxLimits => {
  const record = requireObject(value, "message.limits");
  return {
    buildTimeoutMs: parsePositiveNumber(record.buildTimeoutMs, "message.limits.buildTimeoutMs"),
    sessionLimitMs: parsePositiveNumber(record.sessionLimitMs, "message.limits.sessionLimitMs"),
  };
};

const parseInitMessage = (record: Record<string, unknown>): InitMessage => {
  const photos = requireArray(record.photos, "message.photos");
  if (photos.length === 0) {
    throw new DecodeError("message.photos");
  }
  const code = requireString(record.code, "message.code");
  if (code.trim().length === 0) {
    throw new DecodeError("message.code");
  }
  return {
    type: "init",
    runId: requireString(record.runId, "message.runId"),
    runtimeVersion: requireNumber(record.runtimeVersion, "message.runtimeVersion"),
    photos: photos.map((photo, index) => parseSandboxPhotoTransfer(photo, `message.photos[${index}]`)),
    code,
    limits: parseSandboxLimits(record.limits),
  };
};

const parseCaptureRequestMessage = (record: Record<string, unknown>): CaptureRequestMessage => {
  const views = requireArray(record.views, "message.views");
  if (views.length === 0) {
    throw new DecodeError("message.views");
  }
  return {
    type: "capture",
    runId: requireString(record.runId, "message.runId"),
    requestId: requireString(record.requestId, "message.requestId"),
    views: views.map((view, index) => parseCaptureView(view, `message.views[${index}]`)),
  };
};

/** 解码父页面发出的消息（供测试与沙箱侧实现对拍；runtime.ts 内联实现对应校验）。 */
export const parseParentToSandboxMessage = (value: unknown): ParentToSandboxMessage => {
  const record = requireObject(value, "message");
  const type = requireString(record.type, "message.type");
  switch (type) {
    case "init":
      return parseInitMessage(record);
    case "capture":
      return parseCaptureRequestMessage(record);
    default:
      throw new DecodeError("message.type");
  }
};
