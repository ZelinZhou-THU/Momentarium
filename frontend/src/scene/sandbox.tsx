/**
 * SceneSandbox：三维场景沙箱的宿主侧生命周期（D2 骨架，页面接入在 D4）。
 *
 * 职责（不含页面 UI 与业务状态）：
 *  - 组装 srcdoc（CSP meta + 内联 three UMD + 内联 SceneRuntime），创建
 *    `<iframe sandbox="allow-scripts">`；
 *  - 通过 postMessage 发送 init / capture，并按 contract.ts 解码回传消息；
 *  - 8s build watchdog、截图超时、可选 90s 会话上限，任何失败都销毁 iframe 并回调；
 *  - 卸载时清定时器、销毁 iframe（生成代码只在沙箱内执行，绝不进入 React 上下文）。
 *
 * 使用约束：`code` / `photos` / `captureViews` 必须是稳定引用（页面用 useMemo），
 * 否则每次渲染都会重建会话；`photos` 的 ArrayBuffer 在 init 时会复制后 transfer，
 * 组件不会 detach 调用方的 buffer。
 */
import { useEffect, useRef } from "react";
import type { SandboxErrorCode } from "./contract";
import type {
  BuiltMessage,
  CapturesMessage,
  CaptureRequestMessage,
  CaptureView,
  InitMessage,
  SandboxPhotoTransfer,
  SandboxToParentMessage,
} from "./contract";
import {
  BUILD_TIMEOUT_MS,
  CAPTURE_TIMEOUT_MS,
  FRAME_LOAD_TIMEOUT_MS,
  RUNTIME_VERSION,
  SANDBOX_CSP,
  SANDBOX_IFRAME_SANDBOX,
  SESSION_LIMIT_MS,
} from "./contract";
import { parseSandboxMessage } from "./contract";
import { createCaptureRequest } from "./capture";
import { RUNTIME_SOURCE } from "./runtime";

/** 失败来源：沙箱回传的错误码，或宿主侧超时/资源/协议失败。 */
export type SceneSandboxFailureCode =
  | SandboxErrorCode
  | "RESOURCE_LOAD_FAILED"
  | "FRAME_LOAD_TIMEOUT"
  | "BUILD_TIMEOUT"
  | "CAPTURE_TIMEOUT"
  | "SESSION_TIMEOUT"
  | "PROTOCOL_INVALID";

export class SceneSandboxFailure extends Error {
  readonly code: SceneSandboxFailureCode;
  readonly phase: string;
  readonly requestId?: string;

  constructor(code: SceneSandboxFailureCode, phase: string, message: string, requestId?: string) {
    super(message);
    this.name = "SceneSandboxFailure";
    this.code = code;
    this.phase = phase;
    this.requestId = requestId;
  }
}

export interface SceneSandboxProps {
  /** 生成代码；null 表示不渲染（例如还在生成中）。 */
  readonly code: string | null;
  /** 展示图照片（长边 ≤2048 的 JPEG 字节），按 ctx.photos 顺序传入。 */
  readonly photos: readonly SandboxPhotoTransfer[];
  /** 本次渲染会话 id：服务端 SceneRun id，原样回传以过滤过期消息。 */
  readonly runId: string;
  /** 传入则在 built 后自动请求这些视角的截图；不传表示只浏览不截图。 */
  readonly captureViews?: readonly CaptureView[];
  readonly captureRequest?: CaptureRequestMessage | null;
  /** 会话上限；null 表示不限制（公开页长时间浏览用）。默认 90s。 */
  readonly sessionLimitMs?: number | null;
  readonly className?: string;
  readonly onBuilt?: (message: BuiltMessage) => void;
  readonly onCaptured?: (message: CapturesMessage) => void;
  readonly onCaptureFailure?: (failure: SceneSandboxFailure) => void;
  readonly onPhotoSelected?: (photoId: string) => void;
  /** 焦点在沙箱内按 Esc（跨源 iframe 收不到页面按键，由运行时转发，UI-05）。 */
  readonly onEscapeKeyDown?: () => void;
  readonly onFailure?: (failure: SceneSandboxFailure) => void;
}

interface SceneSandboxCallbacks {
  readonly onBuilt?: (message: BuiltMessage) => void;
  readonly onCaptured?: (message: CapturesMessage) => void;
  readonly onCaptureFailure?: (failure: SceneSandboxFailure) => void;
  readonly onPhotoSelected?: (photoId: string) => void;
  readonly onEscapeKeyDown?: () => void;
  readonly onFailure?: (failure: SceneSandboxFailure) => void;
}

const normalizeFailure = (error: unknown): SceneSandboxFailure =>
  error instanceof SceneSandboxFailure
    ? error
    : new SceneSandboxFailure("RESOURCE_LOAD_FAILED", "host", error instanceof Error ? error.message : String(error));

/** 内联进 srcdoc 的脚本必须不含 HTML 脚本闭合序列（three 0.152.2 已验证；版本升级要重新验证）。 */
const assertInlineSafe = (source: string, origin: string): string => {
  if (source.includes("</script")) {
    throw new SceneSandboxFailure("RESOURCE_LOAD_FAILED", "resources", `${origin} 含脚本闭合序列，不能内联`);
  }
  return source;
};

const buildSrcdoc = (threeSource: string): string => {
  const safeThree = assertInlineSafe(threeSource, "vendor/three.min.js");
  const safeRuntime = assertInlineSafe(RUNTIME_SOURCE, "SceneRuntime");
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Momentarium scene sandbox</title>",
    "<style>html,body{margin:0;height:100%;overflow:hidden;background:#080d12;}canvas{display:block;}</style>",
    "</head>",
    "<body>",
    `<script>${safeThree}</script>`,
    `<script>${safeRuntime}</script>`,
    "</body>",
    "</html>",
  ].join("\n");
};

const fetchThreeSource = async (): Promise<string> => {
  const response = await fetch("/vendor/three.min.js", { cache: "force-cache" });
  if (!response.ok) {
    throw new SceneSandboxFailure(
      "RESOURCE_LOAD_FAILED",
      "resources",
      `加载 three 失败：HTTP ${response.status}（检查后端 /vendor 路由与 frontend/public/vendor）`,
    );
  }
  const source = await response.text();
  if (source.length < 100_000) {
    throw new SceneSandboxFailure("RESOURCE_LOAD_FAILED", "resources", "three 源码长度异常，疑似路由返回了错误页");
  }
  return source;
};

const waitForFrameLoad = (iframe: HTMLIFrameElement, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new SceneSandboxFailure("FRAME_LOAD_TIMEOUT", "frame", `iframe srcdoc 在 ${timeoutMs}ms 内未加载完成`));
    }, timeoutMs);
    iframe.addEventListener(
      "load",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

export function SceneSandbox(props: SceneSandboxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const externalCaptureRef = useRef<((request: CaptureRequestMessage) => void) | null>(null);
  const threeSourceRef = useRef<Promise<string> | null>(null);
  const callbacksRef = useRef<SceneSandboxCallbacks>({});
  callbacksRef.current = {
    onBuilt: props.onBuilt,
    onCaptured: props.onCaptured,
    onCaptureFailure: props.onCaptureFailure,
    onPhotoSelected: props.onPhotoSelected,
    onEscapeKeyDown: props.onEscapeKeyDown,
    onFailure: props.onFailure,
  };

  useEffect(() => {
    const container = containerRef.current;
    const code = props.code;
    if (!container || code === null) return;

    const runId = props.runId;
    const captureViews = props.captureViews;
    const sessionLimitMs = props.sessionLimitMs === undefined ? SESSION_LIMIT_MS : props.sessionLimitMs;
    let disposed = false;
    let frame: HTMLIFrameElement | null = null;
    let built = false;
    let requestSequence = 0;
    let buildTimer: number | null = null;
    let captureTimer: number | null = null;
    let sessionTimer: number | null = null;

    const clearTimer = (timer: number | null): null => {
      if (timer !== null) window.clearTimeout(timer);
      return null;
    };

    const clearAllTimers = (): void => {
      buildTimer = clearTimer(buildTimer);
      captureTimer = clearTimer(captureTimer);
      sessionTimer = clearTimer(sessionTimer);
    };

    const destroyFrame = (): void => {
      if (frame) {
        const current = frame;
        frame = null;
        current.srcdoc = "";
        current.remove();
      }
    };

    const reportFailure = (failure: SceneSandboxFailure): void => {
      if (disposed) return;
      disposed = true;
      clearAllTimers();
      destroyFrame();
      callbacksRef.current.onFailure?.(failure);
    };

    const postToSandbox = (message: InitMessage | CaptureRequestMessage): void => {
      const target = frame?.contentWindow;
      if (!target) {
        throw new SceneSandboxFailure("PROTOCOL_INVALID", "host", "iframe contentWindow 不可用");
      }
      const transferables = message.type === "init" ? message.photos.map((photo) => photo.buffer) : [];
      target.postMessage(message, "*", transferables);
    };

    externalCaptureRef.current = (request) => {
      if (built && request.runId === runId) {
        try {
          postToSandbox(request);
        } catch (error) {
          callbacksRef.current.onCaptureFailure?.(new SceneSandboxFailure("PROTOCOL_INVALID", "capture", String(error), request.requestId));
        }
      }
    };

    const handleSandboxMessage = (event: MessageEvent<unknown>): void => {
      const frameWindow = frame?.contentWindow;
      if (!frameWindow || event.source !== frameWindow || disposed) return;
      let message: SandboxToParentMessage;
      try {
        message = parseSandboxMessage(event.data);
      } catch {
        // 结构不符的消息一律丢弃，不让它进入页面状态机。
        return;
      }
      if (message.runId !== runId) return;
      switch (message.type) {
        case "built": {
          // 同步 build 可能阻塞计时器；迟到的 built 不能清掉已经超期的看门狗。
          if (message.buildMs > BUILD_TIMEOUT_MS) {
            reportFailure(new SceneSandboxFailure("BUILD_TIMEOUT", "build", `build(ctx) 超过 ${BUILD_TIMEOUT_MS}ms（实际 ${message.buildMs}ms）`));
            return;
          }
          built = true;
          buildTimer = clearTimer(buildTimer);
          callbacksRef.current.onBuilt?.(message);
          if (captureViews && captureViews.length > 0) requestCapture();
          return;
        }
        case "captures": {
          captureTimer = clearTimer(captureTimer);
          callbacksRef.current.onCaptured?.(message);
          return;
        }
        case "photoselected": {
          callbacksRef.current.onPhotoSelected?.(message.photoId);
          return;
        }
        case "escape": {
          callbacksRef.current.onEscapeKeyDown?.();
          return;
        }
        case "error": {
          if (message.phase === "capture" && (!captureViews || captureViews.length === 0)) {
            callbacksRef.current.onCaptureFailure?.(new SceneSandboxFailure(message.code, message.phase, message.message, message.requestId));
            return;
          }
          reportFailure(new SceneSandboxFailure(message.code, message.phase, message.message));
          return;
        }
        default:
          return;
      }
    };

    const requestCapture = (): void => {
      if (!captureViews || captureViews.length === 0 || !built) return;
      requestSequence += 1;
      captureTimer = clearTimer(captureTimer);
      captureTimer = window.setTimeout(() => {
        reportFailure(new SceneSandboxFailure("CAPTURE_TIMEOUT", "capture", `截图在 ${CAPTURE_TIMEOUT_MS}ms 内未返回`));
      }, CAPTURE_TIMEOUT_MS);
      try {
        postToSandbox(createCaptureRequest(runId, `${runId}-capture-${requestSequence}`, captureViews));
      } catch (error) {
        reportFailure(normalizeFailure(error));
      }
    };

    const startSession = async (): Promise<void> => {
      try {
        const cachedSource = threeSourceRef.current ?? fetchThreeSource();
        threeSourceRef.current = cachedSource;
        // 失败不缓存：后端 /vendor 路由恢复后重试应能重新拉取。
        const threeSource = await cachedSource.catch((error: unknown) => {
          threeSourceRef.current = null;
          throw error;
        });
        if (disposed) return;
        const srcdoc = buildSrcdoc(threeSource);

        const iframe = document.createElement("iframe");
        iframe.setAttribute("sandbox", SANDBOX_IFRAME_SANDBOX);
        iframe.setAttribute("title", "三维记忆场景");
        iframe.className = "block h-full w-full border-0";
        iframe.srcdoc = srcdoc;
        container.replaceChildren(iframe);
        frame = iframe;

        window.addEventListener("message", handleSandboxMessage);
        await waitForFrameLoad(iframe, FRAME_LOAD_TIMEOUT_MS);
        if (disposed) return;

        if (sessionLimitMs !== null) {
          sessionTimer = window.setTimeout(() => {
            reportFailure(
              new SceneSandboxFailure("SESSION_TIMEOUT", "session", `渲染会话超过 ${sessionLimitMs}ms，已销毁 iframe`),
            );
          }, sessionLimitMs);
        }

        const transferredPhotos = props.photos.map((photo) => ({
          id: photo.id,
          width: photo.width,
          height: photo.height,
          aspect: photo.aspect,
          mimeType: photo.mimeType,
          buffer: photo.buffer.slice(0),
        }));
        const initMessage: InitMessage = {
          type: "init",
          runId,
          runtimeVersion: RUNTIME_VERSION,
          photos: transferredPhotos,
          code,
          limits: { buildTimeoutMs: BUILD_TIMEOUT_MS, sessionLimitMs: sessionLimitMs ?? SESSION_LIMIT_MS },
        };
        buildTimer = window.setTimeout(() => {
          reportFailure(
            new SceneSandboxFailure("BUILD_TIMEOUT", "build", `build(ctx) 在 ${BUILD_TIMEOUT_MS}ms 内未完成`),
          );
        }, BUILD_TIMEOUT_MS);
        postToSandbox(initMessage);
      } catch (error) {
        reportFailure(normalizeFailure(error));
      }
    };

    void startSession();

    return () => {
      disposed = true;
      externalCaptureRef.current = null;
      clearAllTimers();
      destroyFrame();
      window.removeEventListener("message", handleSandboxMessage);
    };
  }, [props.code, props.photos, props.runId, props.captureViews, props.sessionLimitMs]);

  useEffect(() => {
    if (props.captureRequest) externalCaptureRef.current?.(props.captureRequest);
  }, [props.captureRequest]);

  return <div ref={containerRef} className={props.className ?? "h-full w-full"} data-testid="scene-sandbox" />;
}
