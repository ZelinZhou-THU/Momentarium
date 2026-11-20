/**
 * SceneRuntime（沙箱 iframe 内部脚本，宿主代码而非模型生成）。
 *
 * 实现策略：把沙箱运行时写成一个**自包含的 typed function**，再用 `Function.prototype.toString()`
 * 把它序列化成 `RUNTIME_SOURCE` 字符串，由 sandbox.tsx 内联进 srcdoc。
 * 这样沙箱内逻辑仍然受 TypeScript 严格检查，同时不需要在构建期额外生成 JS 文件。
 * 约束：该函数内不得引用任何模块作用域的**值**（类型会在 toString 时被擦除，可以引用）；
 * 所有 helper 与常量都写在函数体内。
 * 编码风格例外：本函数是运行在 iframe 里的事件循环/渲染循环（帧回调、消息队列、截图排程），需要可变状态和命令式循环，
 * 因此允许 `let` 与 `while` / `for...of`；可变状态全部封闭在函数体内，不外泄到模块作用域。
 *
 * 协议、常量与 runtimeVersion 的单一来源是 contract.ts；本文件内联实现必须与之保持一致
 * （contract.test.ts 会断言错误码与版本号同步）。
 */
import type {
  BuiltMessage,
  CaptureView,
  CapturesMessage,
  CspViolation,
  DrawStats,
  EscapeMessage,
  ImageCapture,
  NetworkAttempt,
  PhotoSelectedMessage,
  RuntimeErrorEntry,
  RuntimeEvidence,
  SandboxErrorCode,
  SandboxErrorMessage,
  WebGlInfo,
} from "./contract";

/* -------------------------------------------------------------------------- */
/* 沙箱内可见的最小 three 类型面（仅声明运行时用到的成员；类型在 toString 前被擦除）  */
/* -------------------------------------------------------------------------- */

type ThreeColorValue = number | string;

interface ThreeVector2 {
  set(x: number, y: number): void;
}

interface ThreeVector3 {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): ThreeVector3;
  setFromSpherical(spherical: ThreeSpherical): ThreeVector3;
  copy(vector: ThreeVector3): ThreeVector3;
  clone(): ThreeVector3;
  add(vector: ThreeVector3): ThreeVector3;
  sub(vector: ThreeVector3): ThreeVector3;
  fromArray(values: readonly number[], offset?: number): ThreeVector3;
  length(): number;
}

interface ThreeQuaternion {
  copy(quaternion: ThreeQuaternion): ThreeQuaternion;
  clone(): ThreeQuaternion;
}

interface ThreeSpherical {
  radius: number;
  phi: number;
  theta: number;
  set(radius: number, phi: number, theta: number): ThreeSpherical;
  setFromVector3(vector: ThreeVector3): ThreeSpherical;
  clone(): ThreeSpherical;
}

interface ThreeTexture {
  colorSpace: string;
  anisotropy: number;
}

interface ThreeMaterial {
  map?: ThreeTexture | null;
  emissiveMap?: ThreeTexture | null;
  alphaMap?: ThreeTexture | null;
  uniforms?: Record<string, { value?: unknown }>;
}

interface ThreeObject3D {
  readonly userData: Record<string, unknown>;
  material?: ThreeMaterial | ThreeMaterial[] | null;
  readonly parent: ThreeObject3D | null;
  readonly children: readonly ThreeObject3D[];
  readonly position: ThreeVector3;
  readonly quaternion: ThreeQuaternion;
  traverse(callback: (object: ThreeObject3D) => void): void;
}

interface ThreeScene {
  background: unknown;
  readonly children: readonly ThreeObject3D[];
  traverse(callback: (object: ThreeObject3D) => void): void;
}

interface ThreePerspectiveCamera extends ThreeObject3D {
  fov: number;
  aspect: number;
  updateProjectionMatrix(): void;
  updateMatrixWorld(force?: boolean): void;
  lookAt(target: ThreeVector3): void;
}

interface ThreeRenderInfo {
  readonly calls: number;
  readonly triangles: number;
  readonly points: number;
}

interface ThreeCapabilities {
  getMaxAnisotropy(): number;
}

interface ThreeWebGLRendererParameters {
  antialias?: boolean;
  alpha?: boolean;
  preserveDrawingBuffer?: boolean;
  powerPreference?: "default" | "high-performance" | "low-power";
}

interface ThreeWebGLRenderer {
  readonly domElement: HTMLCanvasElement;
  outputColorSpace: string;
  toneMapping: number;
  toneMappingExposure: number;
  readonly info: { readonly render: ThreeRenderInfo };
  readonly capabilities: ThreeCapabilities;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: ThreeScene, camera: ThreePerspectiveCamera): void;
}

interface ThreeTextureLoader {
  loadAsync(url: string): Promise<ThreeTexture>;
}

interface ThreeRaycasterIntersection {
  readonly object: ThreeObject3D;
}

interface ThreeRaycaster {
  setFromCamera(coordinates: ThreeVector2, camera: ThreePerspectiveCamera): void;
  intersectObjects(objects: readonly ThreeObject3D[], recursive?: boolean): readonly ThreeRaycasterIntersection[];
}

interface ThreeApi {
  readonly WebGLRenderer: new (parameters?: ThreeWebGLRendererParameters) => ThreeWebGLRenderer;
  readonly Scene: new () => ThreeScene;
  readonly PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => ThreePerspectiveCamera;
  readonly Color: new (value?: ThreeColorValue) => unknown;
  readonly TextureLoader: new () => ThreeTextureLoader;
  readonly Vector2: new (x?: number, y?: number) => ThreeVector2;
  readonly Vector3: new (x?: number, y?: number, z?: number) => ThreeVector3;
  readonly Spherical: new (radius?: number, phi?: number, theta?: number) => ThreeSpherical;
  readonly Raycaster: new () => ThreeRaycaster;
  readonly MathUtils: { degToRad(degrees: number): number };
  readonly SRGBColorSpace: string;
  readonly ACESFilmicToneMapping: number;
}

/** 沙箱 document 已内联 three UMD，暴露全局 THREE（类型只在编译期存在）。 */
declare const THREE: ThreeApi;

/* -------------------------------------------------------------------------- */
/* 运行时状态与上下文（模块作用域的类型在 toString 时被擦除）                     */
/* -------------------------------------------------------------------------- */

interface ScenePhoto {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  readonly texture: ThreeTexture;
}

interface ScenePhotoInput {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  readonly mimeType: string;
  readonly buffer: ArrayBuffer;
}

interface OrbitControlsOptions {
  target?: readonly number[];
  minDistance?: number;
  maxDistance?: number;
  rotateSpeed?: number;
  zoomSpeed?: number;
}

interface CaptureFrame {
  readonly target: ThreeVector3;
  readonly spherical: ThreeSpherical;
}

interface OrbitControlsHandle {
  readonly target: ThreeVector3;
  getFrame(): CaptureFrame;
  reset(): void;
}

interface FpsWaiter {
  readonly requiredFrames: number;
  readonly resolve: () => void;
}

interface SceneRuntimeContext {
  readonly runtimeVersion: number;
  readonly THREE: ThreeApi;
  readonly scene: ThreeScene;
  readonly camera: ThreePerspectiveCamera;
  readonly renderer: ThreeWebGLRenderer;
  readonly photos: readonly ScenePhoto[];
  addOrbitControls(options?: OrbitControlsOptions): OrbitControlsHandle;
  onFrame(callback: (deltaSeconds: number) => void): void;
  setBackground(color: ThreeColorValue): void;
}

type SceneBuildFunction = (context: SceneRuntimeContext) => void;

interface SceneRuntimeState {
  runId: string | null;
  startedAt: number;
  initialized: boolean;
  built: boolean;
  renderer: ThreeWebGLRenderer | null;
  scene: ThreeScene | null;
  camera: ThreePerspectiveCamera | null;
  photos: ScenePhoto[];
  orbitControls: OrbitControlsHandle | null;
  onFrameCallbacks: ((deltaSeconds: number) => void)[];
  errors: RuntimeErrorEntry[];
  networkAttempts: NetworkAttempt[];
  cspViolations: CspViolation[];
  frameTimes: number[];
  fpsWaiter: FpsWaiter | null;
  framesRendered: number;
  animationFrameId: number | null;
  lastFrameTimestamp: number | null;
  captureBusy: boolean;
  webglInfo: WebGlInfo | null;
  timings: { texturesMs: number | null; buildMs: number | null; firstFrameMs: number | null };
}

type RuntimePhase = "init" | "textures" | "build" | "capture" | "frame" | "window" | "promise" | "renderer";

type OutboundPayload =
  | Omit<BuiltMessage, "runId">
  | Omit<CapturesMessage, "runId">
  | Omit<SandboxErrorMessage, "runId">
  | Omit<PhotoSelectedMessage, "runId">
  | Omit<EscapeMessage, "runId">;

/* -------------------------------------------------------------------------- */
/* 沙箱运行时本体                                                              */
/* -------------------------------------------------------------------------- */

function installSceneRuntime(): void {
  "use strict";

  /** 与 contract.ts 的 RUNTIME_VERSION 同步（沙箱内无法 import，测试断言版本号一致）。 */
  const RUNTIME_VERSION = 1;
  const JPEG_QUALITY = 0.82;
  const ERROR_LIMIT = 12;
  const NETWORK_ATTEMPT_LIMIT = 20;
  const FPS_SAMPLE_FRAMES = 30;
  const FPS_MAX_WAIT_MS = 4_000;
  const DEFAULT_ORBIT_TARGET: readonly [number, number, number] = [0, 1.4, 0];
  const MIN_POLAR_ANGLE = 0.12;
  const MAX_POLAR_ANGLE = Math.PI / 2 - 0.02;
  const PHOTO_CLICK_MAX_MOVE_PX = 5;
  const PHOTO_CLICK_MAX_DURATION_MS = 500;
  const ORBIT_ROTATE_SPEED = 0.005;
  const ORBIT_TILT_SPEED = 0.003;
  const ORBIT_ZOOM_SPEED = 0.0012;

  class RuntimeFailure extends Error {
    readonly code: SandboxErrorCode;
    readonly phase: RuntimePhase;
    readonly original: unknown;

    constructor(code: SandboxErrorCode, message: string, phase: RuntimePhase, original?: unknown) {
      super(message);
      this.name = "RuntimeFailure";
      this.code = code;
      this.phase = phase;
      this.original = original;
    }
  }

  const state: SceneRuntimeState = {
    runId: null,
    startedAt: 0,
    initialized: false,
    built: false,
    renderer: null,
    scene: null,
    camera: null,
    photos: [],
    orbitControls: null,
    onFrameCallbacks: [],
    errors: [],
    networkAttempts: [],
    cspViolations: [],
    frameTimes: [],
    fpsWaiter: null,
    framesRendered: 0,
    animationFrameId: null,
    lastFrameTimestamp: null,
    captureBusy: false,
    webglInfo: null,
    timings: { texturesMs: null, buildMs: null, firstFrameMs: null },
  };

  /* ------------------------------ 基础工具 ------------------------------ */

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

  const isUnknownArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

  const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

  const roundMs = (value: number | null): number | null =>
    typeof value === "number" ? Math.round(value * 10) / 10 : null;

  const requireRenderer = (): ThreeWebGLRenderer => {
    const renderer = state.renderer;
    if (!renderer) throw new RuntimeFailure("RUNTIME_FAILED", "renderer 尚未初始化", "init");
    return renderer;
  };

  const requireScene = (): ThreeScene => {
    const scene = state.scene;
    if (!scene) throw new RuntimeFailure("RUNTIME_FAILED", "scene 尚未初始化", "init");
    return scene;
  };

  const requireCamera = (): ThreePerspectiveCamera => {
    const camera = state.camera;
    if (!camera) throw new RuntimeFailure("RUNTIME_FAILED", "camera 尚未初始化", "init");
    return camera;
  };

  /* ------------------------------ 协议与错误 ---------------------------- */

  const toErrorEntry = (phase: RuntimePhase, error: unknown): RuntimeErrorEntry => {
    const isErrorLike = error instanceof Error;
    return {
      phase,
      name: isErrorLike ? error.name : "Error",
      message: isErrorLike ? error.message : String(error),
      stack: isErrorLike && typeof error.stack === "string" ? error.stack.slice(0, 1200) : null,
      atMs: Math.round(performance.now()),
    };
  };

  const recordError = (phase: RuntimePhase, error: unknown): void => {
    if (state.errors.length >= ERROR_LIMIT) return;
    state.errors.push(toErrorEntry(phase, error));
  };

  const postToParent = (message: OutboundPayload): void => {
    const runId = state.runId ?? "run-unknown";
    window.parent.postMessage({ ...message, runId }, "*");
  };

  const postFailure = (error: unknown, requestId?: string): void => {
    const isRuntimeFailure = error instanceof RuntimeFailure;
    const code: SandboxErrorCode = isRuntimeFailure ? error.code : "RUNTIME_FAILED";
    const phase: RuntimePhase = isRuntimeFailure ? error.phase : "init";
    postToParent({
      type: "error",
      ...(requestId === undefined ? {} : { requestId }),
      code,
      phase,
      message: describeError(error),
      errors: state.errors.slice(),
    });
  };

  /* ---------------------- 禁止资源监测（networkAttempts 硬门禁） --------- */

  const installNetworkMonitor = (): void => {
    const recordAttempt = (kind: string, url: string): void => {
      if (state.networkAttempts.length >= NETWORK_ATTEMPT_LIMIT) return;
      state.networkAttempts.push({ kind, url: url.slice(0, 160), atMs: Math.round(performance.now()) });
    };

    const describeFetchInput = (input: RequestInfo | URL): string =>
      input instanceof Request ? input.url : String(input);

    const originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
      window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        recordAttempt("fetch", describeFetchInput(input));
        return originalFetch(input, init);
      };
    }

    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function monitoredXhrOpen(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ): void {
      recordAttempt("xhr", String(url));
      originalXhrOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
    };

    const staticWebSocket = window.WebSocket;
    class MonitoredWebSocket extends staticWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        recordAttempt("websocket", String(url));
      }
    }
    Object.defineProperty(window, "WebSocket", { value: MonitoredWebSocket, configurable: true, writable: true });

    const staticEventSource = window.EventSource;
    class MonitoredEventSource extends staticEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super(url, eventSourceInitDict);
        recordAttempt("eventsource", String(url));
      }
    }
    Object.defineProperty(window, "EventSource", { value: MonitoredEventSource, configurable: true, writable: true });

    if (typeof navigator.sendBeacon === "function") {
      const originalSendBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url: string | URL, data?: BodyInit | null): boolean => {
        recordAttempt("sendbeacon", String(url));
        return originalSendBeacon(url, data);
      };
    }

    document.addEventListener("securitypolicyviolation", (event: SecurityPolicyViolationEvent) => {
      if (state.cspViolations.length >= NETWORK_ATTEMPT_LIMIT) return;
      state.cspViolations.push({
        directive: event.violatedDirective,
        blockedUri: String(event.blockedURI ?? "").slice(0, 160),
        atMs: Math.round(performance.now()),
      });
    });
  };

  /* ---------------------------- 渲染器与场景 --------------------------- */

  const probeWebGlContext = (): WebGL2RenderingContext | WebGLRenderingContext | null => {
    const canvas = document.createElement("canvas");
    const attributes: WebGLContextAttributes = {
      alpha: false,
      antialias: true,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: true,
    };
    return canvas.getContext("webgl2", attributes) ?? canvas.getContext("webgl", attributes);
  };

  const readWebGlInfo = (context: WebGL2RenderingContext | WebGLRenderingContext): WebGlInfo => {
    const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
    const readParameter = (parameter: number, fallback: string): string => {
      const value: unknown = context.getParameter(parameter);
      return typeof value === "string" ? value : fallback;
    };
    return {
      version: readParameter(context.VERSION, "unknown"),
      renderer: debugInfo ? readParameter(debugInfo.UNMASKED_RENDERER_WEBGL, "unknown") : "unknown",
      vendor: debugInfo ? readParameter(debugInfo.UNMASKED_VENDOR_WEBGL, "unknown") : "unknown",
      maxTextureSize: (() => {
        const value: unknown = context.getParameter(context.MAX_TEXTURE_SIZE);
        return typeof value === "number" ? value : 0;
      })(),
    };
  };

  const createRenderer = (): ThreeWebGLRenderer => {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    document.body.appendChild(renderer.domElement);
    return renderer;
  };

  const resizeRenderer = (): void => {
    const renderer = state.renderer;
    const camera = state.camera;
    if (!renderer || !camera) return;
    const width = Math.max(1, Math.floor(window.innerWidth));
    const height = Math.max(1, Math.floor(window.innerHeight));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, true);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const createSceneAndCamera = (): { scene: ThreeScene; camera: ThreePerspectiveCamera } => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.1,
      400,
    );
    camera.position.set(0, 1.6, 6);
    camera.lookAt(new THREE.Vector3(0, 1.4, 0));
    camera.updateMatrixWorld();
    return { scene, camera };
  };

  const ensureCameraSane = (): void => {
    const camera = requireCamera();
    const position = camera.position;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
      position.set(0, 1.6, 6);
      camera.lookAt(new THREE.Vector3(0, 1.4, 0));
    }
    if (!(camera.fov > 1 && camera.fov < 179)) camera.fov = 52;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };

  /* ------------------------------- 照片纹理 ---------------------------- */

  const validatePhotoInputs = (inputs: unknown): ScenePhotoInput[] => {
    if (!isUnknownArray(inputs) || inputs.length === 0) {
      throw new RuntimeFailure("PHOTOS_INVALID", "init() 需要非空的 photos 数组", "init");
    }
    return inputs.map((input, index) => {
      if (!isRecord(input) || typeof input.id !== "string") {
        throw new RuntimeFailure("PHOTOS_INVALID", `photos[${index}] 缺少字符串 id`, "init");
      }
      if (!(input.buffer instanceof ArrayBuffer)) {
        throw new RuntimeFailure("PHOTOS_INVALID", `photos[${index}].buffer 不是 ArrayBuffer（是否已 transfer？）`, "init");
      }
      const width = Number(input.width);
      const height = Number(input.height);
      if (!(width > 0) || !(height > 0)) {
        throw new RuntimeFailure("PHOTOS_INVALID", `photos[${index}] 缺少正数 width/height`, "init");
      }
      return {
        id: input.id,
        width,
        height,
        aspect: width / height,
        mimeType: typeof input.mimeType === "string" ? input.mimeType : "image/jpeg",
        buffer: input.buffer,
      };
    });
  };

  const loadPhotoTextures = async (photoInputs: readonly ScenePhotoInput[]): Promise<ScenePhoto[]> => {
    const loader = new THREE.TextureLoader();
    const renderer = requireRenderer();
    return Promise.all(
      photoInputs.map(async (input) => {
        const blob = new Blob([input.buffer], { type: input.mimeType });
        const objectUrl = URL.createObjectURL(blob);
        try {
          const texture = await loader.loadAsync(objectUrl);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          return { id: input.id, width: input.width, height: input.height, aspect: input.aspect, texture };
        } catch (error) {
          throw new RuntimeFailure(
            "TEXTURE_LOAD_FAILED",
            `照片 "${input.id}" 纹理加载失败：${describeError(error)}`,
            "textures",
            error,
          );
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }),
    );
  };

  /* ------------------------- 简化 Orbit 控制（兜底交互） ---------------- */

  const createOrbitControls = (options?: OrbitControlsOptions): OrbitControlsHandle => {
    const settings = isRecord(options) ? options : {};
    const rawTarget = isUnknownArray(settings.target) ? settings.target : DEFAULT_ORBIT_TARGET;
    const readTargetOrdinate = (index: number): number => {
      const value = rawTarget[index];
      return typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_ORBIT_TARGET[index] ?? 0;
    };
    const target = new THREE.Vector3().fromArray([readTargetOrdinate(0), readTargetOrdinate(1), readTargetOrdinate(2)]);
    const readNumber = (value: unknown, fallback: number): number =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const config = {
      minDistance: readNumber(settings.minDistance, 1.5),
      maxDistance: readNumber(settings.maxDistance, 40),
      rotateSpeed: readNumber(settings.rotateSpeed, 1),
      zoomSpeed: readNumber(settings.zoomSpeed, 1),
    };
    const camera = requireCamera();
    const element = requireRenderer().domElement;
    const initialPosition = camera.position.clone();
    const initialQuaternion = camera.quaternion.clone();
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
    if (!(spherical.radius > 0.001)) spherical.set(6, Math.PI / 2 - 0.15, 0);
    spherical.phi = clamp(spherical.phi, MIN_POLAR_ANGLE, MAX_POLAR_ANGLE);

    const applyCamera = (): void => {
      camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(target));
      camera.lookAt(target);
      camera.updateMatrixWorld();
    };

    let activePointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let downAt = 0;
    let movedPx = 0;

    const onPointerDown = (event: PointerEvent): void => {
      if (activePointerId !== null || event.button !== 0) return;
      activePointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      downAt = performance.now();
      movedPx = 0;
      element.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) return;
      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      movedPx += Math.abs(deltaX) + Math.abs(deltaY);
      if (movedPx < 2) return;
      spherical.theta -= deltaX * ORBIT_ROTATE_SPEED * config.rotateSpeed;
      spherical.phi = clamp(
        spherical.phi - deltaY * ORBIT_TILT_SPEED * config.rotateSpeed,
        MIN_POLAR_ANGLE,
        MAX_POLAR_ANGLE,
      );
      applyCamera();
    };

    const releasePointer = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) return;
      const elapsed = performance.now() - downAt;
      activePointerId = null;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      const isClick = movedPx <= PHOTO_CLICK_MAX_MOVE_PX && elapsed <= PHOTO_CLICK_MAX_DURATION_MS;
      if (isClick) selectPhotoAtPoint(event.clientX, event.clientY);
    };

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const zoomFactor = Math.exp(event.deltaY * ORBIT_ZOOM_SPEED * config.zoomSpeed);
      spherical.radius = clamp(spherical.radius * zoomFactor, config.minDistance, config.maxDistance);
      applyCamera();
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", releasePointer);
    element.addEventListener("pointercancel", releasePointer);
    element.addEventListener("wheel", onWheel, { passive: false });

    return {
      target,
      getFrame() {
        return { target: target.clone(), spherical: spherical.clone() };
      },
      reset() {
        camera.position.copy(initialPosition);
        camera.quaternion.copy(initialQuaternion);
        camera.updateMatrixWorld();
      },
    };
  };

  /* --------------------------- 照片点击拾取 ---------------------------- */

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  const findPhotoIdFromUserData = (object: ThreeObject3D): string | null => {
    let node: ThreeObject3D | null = object;
    while (node) {
      const userData = node.userData;
      if (typeof userData.photoId === "string") return userData.photoId;
      const photoIds = userData.photoIds;
      if (isUnknownArray(photoIds)) {
        const photoId = photoIds.find((candidate) => typeof candidate === "string");
        if (typeof photoId === "string") return photoId;
      }
      node = node.parent;
    }
    return null;
  };

  const findPhotoIdByTexture = (object: ThreeObject3D): string | null => {
    let node: ThreeObject3D | null = object;
    while (node) {
      const nodeMaterial = node.material;
      const materials = isUnknownArray(nodeMaterial) ? nodeMaterial : nodeMaterial ? [nodeMaterial] : [];
      for (const material of materials) {
        const slots: readonly (ThreeTexture | null | undefined)[] = [material.map, material.emissiveMap, material.alphaMap];
        for (const texture of slots) {
          if (!texture) continue;
          const photo = state.photos.find((candidate) => candidate.texture === texture);
          if (photo) return photo.id;
        }
      }
      node = node.parent;
    }
    return null;
  };

  const selectPhotoAtPoint = (clientX: number, clientY: number): void => {
    if (!state.built) return;
    const element = requireRenderer().domElement;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointerNdc, requireCamera());
    const hits = raycaster.intersectObjects(requireScene().children, true);
    for (const hit of hits) {
      const photoId = findPhotoIdFromUserData(hit.object) ?? findPhotoIdByTexture(hit.object);
      if (photoId) {
        postToParent({ type: "photoselected", photoId });
        return;
      }
    }
  };

  /* --------------------- 照片使用检测（硬门禁辅助） -------------------- */

  const detectPhotoIdsUsed = (): string[] => {
    const usedIds = new Set<string>();
    const textureToPhotoId = new Map<unknown, string>(state.photos.map((photo) => [photo.texture, photo.id]));
    requireScene().traverse((object) => {
      const userData = object.userData;
      if (typeof userData.photoId === "string") usedIds.add(userData.photoId);
      const declaredIds = userData.photoIds;
      if (isUnknownArray(declaredIds)) {
        for (const photoId of declaredIds) {
          if (typeof photoId === "string") usedIds.add(photoId);
        }
      }
      const objectMaterial = object.material;
      const materials = isUnknownArray(objectMaterial) ? objectMaterial : objectMaterial ? [objectMaterial] : [];
      for (const material of materials) {
        const slots: readonly (ThreeTexture | null | undefined)[] = [material.map, material.emissiveMap, material.alphaMap];
        for (const texture of slots) {
          const photoId = texture ? textureToPhotoId.get(texture) : undefined;
          if (photoId) usedIds.add(photoId);
        }
        const uniforms = material.uniforms;
        if (isRecord(uniforms)) {
          for (const uniform of Object.values(uniforms)) {
            const value = isRecord(uniform) ? uniform.value : undefined;
            if (isRecord(value) && value.isTexture === true) {
              const photoId = textureToPhotoId.get(value);
              if (photoId) usedIds.add(photoId);
            }
          }
        }
      }
    });
    return state.photos.map((photo) => photo.id).filter((photoId) => usedIds.has(photoId));
  };

  /* ---------------------------- 生成代码执行 --------------------------- */

  const isCallable = (value: unknown): value is (...args: readonly unknown[]) => unknown => typeof value === "function";

  const isSceneBuildFunction = (value: unknown): value is SceneBuildFunction => typeof value === "function";

  const compileSceneCode = (code: string): SceneBuildFunction => {
    if (code.trim().length === 0) {
      throw new RuntimeFailure("CODE_INVALID", "场景代码为空", "build");
    }
    const factory: unknown = (() => {
      try {
        return new Function(`${code}\n;return typeof build === "function" ? build : null;`);
      } catch (error) {
        throw new RuntimeFailure("CODE_INVALID", describeError(error), "build", error);
      }
    })();
    if (!isCallable(factory)) {
      throw new RuntimeFailure("CODE_INVALID", "场景代码编译失败：未能得到函数", "build");
    }
    const buildCandidate: unknown = factory();
    if (!isSceneBuildFunction(buildCandidate)) {
      throw new RuntimeFailure("CODE_INVALID", "场景代码必须定义 function build(ctx)", "build");
    }
    return buildCandidate;
  };

  const createContext = (): SceneRuntimeContext => {
    const scene = requireScene();
    const camera = requireCamera();
    const renderer = requireRenderer();
    return {
      runtimeVersion: RUNTIME_VERSION,
      THREE,
      scene,
      camera,
      renderer,
      photos: state.photos,
      addOrbitControls(options?: OrbitControlsOptions): OrbitControlsHandle {
        if (state.orbitControls) return state.orbitControls;
        const controls = createOrbitControls(options);
        state.orbitControls = controls;
        return controls;
      },
      onFrame(callback: (deltaSeconds: number) => void): void {
        if (typeof callback === "function") state.onFrameCallbacks.push(callback);
      },
      setBackground(color: ThreeColorValue): void {
        scene.background = new THREE.Color(color);
      },
    };
  };

  /** new Function 在源码前多包两行（`function anonymous(` 与 `) {`），栈里的行号要减掉。 */
  const FUNCTION_HEADER_LINES = 2;

  /**
   * 从异常栈定位到生成代码的行（Chrome `<anonymous>:L:C` / Firefox `> Function:L:C`），
   * 附上该行源码片段，让修复提示词能对准出错位置；定位不到返回空串。
   */
  const locateInSceneCode = (error: unknown, code: string): string => {
    const stack = error instanceof Error && typeof error.stack === "string" ? error.stack : "";
    const matched = /(?:<anonymous>|> Function):(\d+):(\d+)/.exec(stack);
    if (!matched) return "";
    const line = Number(matched[1]) - FUNCTION_HEADER_LINES;
    const source = code.split("\n")[line - 1];
    if (line < 1 || source === undefined) return "";
    return `（第 ${line} 行：${source.trim().slice(0, 120)}）`;
  };

  const executeBuild = (code: string): void => {
    const buildFunction = compileSceneCode(code);
    const context = createContext();
    const startedAt = performance.now();
    try {
      buildFunction(context);
    } catch (error) {
      throw new RuntimeFailure("BUILD_FAILED", `${describeError(error)}${locateInSceneCode(error, code)}`, "build", error);
    }
    state.timings.buildMs = performance.now() - startedAt;
  };

  /* ----------------------------- 帧循环与 fps -------------------------- */

  const pushFrameTime = (timestamp: number): void => {
    state.frameTimes.push(timestamp);
    if (state.frameTimes.length > FPS_SAMPLE_FRAMES + 1) state.frameTimes.shift();
    const waiter = state.fpsWaiter;
    if (waiter && state.frameTimes.length >= waiter.requiredFrames + 1) {
      waiter.resolve();
    }
  };

  const computeFps = (): number | null => {
    const times = state.frameTimes;
    if (times.length < 2) return null;
    const elapsedMs = times[times.length - 1] - times[0];
    if (!(elapsedMs > 0)) return null;
    return Math.round(((times.length - 1) * 1000 * 10) / elapsedMs) / 10;
  };

  const waitForFpsWindow = (requiredFrames: number, timeoutMs: number): Promise<void> => {
    if (state.frameTimes.length >= requiredFrames + 1) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        state.fpsWaiter = null;
        resolve();
      }, timeoutMs);
      state.fpsWaiter = {
        requiredFrames,
        resolve: () => {
          state.fpsWaiter = null;
          window.clearTimeout(timer);
          resolve();
        },
      };
    });
  };

  const startAnimationLoop = (): void => {
    const renderer = requireRenderer();
    const scene = requireScene();
    const camera = requireCamera();
    state.lastFrameTimestamp = null;
    const tick = (timestamp: number): void => {
      if (state.animationFrameId === null) return;
      state.animationFrameId = window.requestAnimationFrame(tick);
      const last = state.lastFrameTimestamp;
      const deltaSeconds = last === null ? 0 : Math.min(0.1, (timestamp - last) / 1000);
      state.lastFrameTimestamp = timestamp;
      pushFrameTime(timestamp);
      state.framesRendered += 1;
      try {
        for (const callback of state.onFrameCallbacks) callback(deltaSeconds);
        renderer.render(scene, camera);
      } catch (error) {
        recordError("frame", error);
        state.onFrameCallbacks.length = 0;
      }
    };
    state.animationFrameId = window.requestAnimationFrame(tick);
  };

  /* ------------------------------- 截图 ------------------------------- */

  const computeCaptureFrame = (): CaptureFrame => {
    const controls = state.orbitControls;
    const target = controls ? controls.target.clone() : new THREE.Vector3().fromArray(DEFAULT_ORBIT_TARGET);
    const spherical = new THREE.Spherical().setFromVector3(requireCamera().position.clone().sub(target));
    if (!(spherical.radius > 0.001)) spherical.set(6, Math.PI / 2 - 0.15, 0);
    return { target, spherical };
  };

  const applyCaptureView = (view: CaptureView): void => {
    if (view.azimuthDeg === 0 && view.elevationDeg === 0) return;
    const camera = requireCamera();
    const frame = computeCaptureFrame();
    const spherical = frame.spherical.clone();
    spherical.theta += THREE.MathUtils.degToRad(view.azimuthDeg);
    spherical.phi = clamp(
      spherical.phi - THREE.MathUtils.degToRad(view.elevationDeg),
      MIN_POLAR_ANGLE,
      MAX_POLAR_ANGLE,
    );
    camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(frame.target));
    camera.lookAt(frame.target);
    camera.updateMatrixWorld();
  };

  const captureImages = (views: readonly CaptureView[]): ImageCapture[] => {
    const renderer = requireRenderer();
    const scene = requireScene();
    const camera = requireCamera();
    const cameraPosition = camera.position.clone();
    const cameraQuaternion = camera.quaternion.clone();
    const canvas = renderer.domElement;
    try {
      return views.map((view, index) => {
        applyCaptureView(view);
        renderer.render(scene, camera);
        return {
          view,
          index,
          dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
          width: canvas.width,
          height: canvas.height,
        };
      });
    } finally {
      camera.position.copy(cameraPosition);
      camera.quaternion.copy(cameraQuaternion);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
    }
  };

  const collectRuntimeStats = (): RuntimeEvidence => {
    const renderer = requireRenderer();
    const canvas = renderer.domElement;
    const renderInfo = renderer.info.render;
    const webglInfo = state.webglInfo;
    if (!webglInfo) throw new RuntimeFailure("RUNTIME_FAILED", "WebGL 信息缺失", "capture");
    const drawStats: DrawStats = {
      calls: renderInfo.calls,
      triangles: renderInfo.triangles,
      points: renderInfo.points,
    };
    return {
      runtimeVersion: RUNTIME_VERSION,
      buildMs: roundMs(state.timings.buildMs),
      texturesMs: roundMs(state.timings.texturesMs),
      firstFrameMs: roundMs(state.timings.firstFrameMs),
      fps: computeFps(),
      errors: state.errors.slice(),
      photoIdsUsed: detectPhotoIdsUsed(),
      photoCount: state.photos.length,
      networkAttempts: state.networkAttempts.length + state.cspViolations.length,
      networkAttemptDetails: state.networkAttempts.slice(0, 10),
      cspViolations: state.cspViolations.slice(0, 10),
      framesRendered: state.framesRendered,
      canvas: { width: canvas.width, height: canvas.height },
      drawStats,
      webgl: webglInfo,
      orbitControls: Boolean(state.orbitControls),
      sessionElapsedMs: Math.round(performance.now() - state.startedAt),
    };
  };

  /* --------------------------- init / capture -------------------------- */

  const handleInit = async (message: Record<string, unknown>): Promise<void> => {
    if (state.initialized) {
      postToParent({ type: "error", code: "SESSION_ALREADY_INITIALIZED", phase: "init", message: "init() 被重复调用", errors: [] });
      return;
    }
    state.initialized = true;
    state.runId = typeof message.runId === "string" ? message.runId : "run-unknown";
    state.startedAt = performance.now();
    try {
      if (typeof message.runtimeVersion === "number" && message.runtimeVersion !== RUNTIME_VERSION) {
        throw new RuntimeFailure(
          "RUNTIME_VERSION_MISMATCH",
          `期望 runtimeVersion ${RUNTIME_VERSION}，收到 ${message.runtimeVersion}`,
          "init",
        );
      }
      const photoInputs = validatePhotoInputs(message.photos);
      const code = message.code;
      if (typeof code !== "string" || code.trim().length === 0) {
        throw new RuntimeFailure("CODE_INVALID", "init() 缺少生成的场景代码", "build");
      }

      const probeContext = probeWebGlContext();
      if (!probeContext) {
        throw new RuntimeFailure("WEBGL_UNAVAILABLE", "当前浏览器/沙箱不可用 WebGL", "init");
      }
      state.webglInfo = readWebGlInfo(probeContext);
      const renderer = createRenderer();
      state.renderer = renderer;
      renderer.domElement.addEventListener("webglcontextlost", (event: Event) => {
        event.preventDefault();
        recordError("renderer", new Error("WebGL 上下文丢失"));
      });

      const sceneAndCamera = createSceneAndCamera();
      state.scene = sceneAndCamera.scene;
      state.camera = sceneAndCamera.camera;
      resizeRenderer();

      installNetworkMonitor();

      const texturesStartedAt = performance.now();
      state.photos = await loadPhotoTextures(photoInputs);
      state.timings.texturesMs = performance.now() - texturesStartedAt;

      executeBuild(code);
      ensureCameraSane();
      resizeRenderer();
      renderer.render(requireScene(), requireCamera());
      state.built = true;
      state.timings.firstFrameMs = performance.now() - state.startedAt;
      startAnimationLoop();
      postToParent({
        type: "built",
        runtimeVersion: RUNTIME_VERSION,
        buildMs: roundMs(state.timings.buildMs) ?? 0,
        texturesMs: roundMs(state.timings.texturesMs),
        firstFrameMs: roundMs(state.timings.firstFrameMs),
        photoCount: state.photos.length,
      });
    } catch (error) {
      const phase: RuntimePhase = error instanceof RuntimeFailure ? error.phase : "init";
      recordError(phase, error instanceof RuntimeFailure && error.original ? error.original : error);
      postFailure(error);
    }
  };

  const handleCapture = async (message: Record<string, unknown>): Promise<void> => {
    const requestId = typeof message.requestId === "string" ? message.requestId : "";
    if (!state.built) {
      postToParent({ type: "error", requestId, code: "NOT_READY", phase: "capture", message: "capture() 早于 built", errors: [] });
      return;
    }
    if (state.captureBusy) {
      postToParent({ type: "error", requestId, code: "CAPTURE_BUSY", phase: "capture", message: "已有截图在进行", errors: [] });
      return;
    }
    state.captureBusy = true;
    try {
      // spec §9.5：fps 按 30 帧平均，因此先等满采样窗口（有上限，慢场景也照常出图）。
      await waitForFpsWindow(FPS_SAMPLE_FRAMES, FPS_MAX_WAIT_MS);
      const rawViews = isUnknownArray(message.views) ? message.views : [];
      const views: CaptureView[] = rawViews.map((view) => {
        if (!isRecord(view)) return { azimuthDeg: 0, elevationDeg: 0 };
        return {
          azimuthDeg: typeof view.azimuthDeg === "number" && Number.isFinite(view.azimuthDeg) ? view.azimuthDeg : 0,
          elevationDeg:
            typeof view.elevationDeg === "number" && Number.isFinite(view.elevationDeg) ? view.elevationDeg : 0,
        };
      });
      const images = captureImages(views);
      const runtime = collectRuntimeStats();
      postToParent({
        type: "captures",
        requestId: typeof message.requestId === "string" ? message.requestId : "",
        runtimeVersion: RUNTIME_VERSION,
        images,
        runtime,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") {
        recordError("capture", error);
        postToParent({
          type: "error",
          requestId,
          code: "CAPTURE_TAINTED",
          phase: "capture",
          message: "canvas.toDataURL() 失败：绘制缓冲被跨源污染",
          errors: state.errors.slice(),
        });
        return;
      }
      recordError("capture", error);
      postFailure(new RuntimeFailure("CAPTURE_FAILED", describeError(error), "capture", error), requestId);
    } finally {
      state.captureBusy = false;
    }
  };

  /* --------------------------- 宿主事件绑定 ---------------------------- */

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!isRecord(data) || typeof data.type !== "string") return;
    if (data.type === "init") {
      handleInit(data).catch((error: unknown) => postFailure(error));
      return;
    }
    if (data.type === "capture") {
      handleCapture(data).catch((error: unknown) => postFailure(error));
    }
  });

  window.addEventListener("error", (event: ErrorEvent) => {
    recordError("window", event.error instanceof Error ? event.error : new Error(event.message));
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    recordError("promise", event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
  });

  window.addEventListener("resize", () => {
    resizeRenderer();
  });

  /* 焦点在沙箱内时 Esc 不会冒泡到父页面（跨源 iframe），转发给宿主（如退出沉浸观看，UI-05）。 */
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      postToParent({ type: "escape" });
    }
  });
}

/**
 * 内联进 iframe srcdoc 的沙箱运行时源码（IIFE）。
 * 注意：函数内部不能引用模块作用域的值（类型已在 toString 时擦除）。
 */
export const RUNTIME_SOURCE: string = `(${installSceneRuntime.toString()})();`;
