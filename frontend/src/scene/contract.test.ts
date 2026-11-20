/**
 * 场景沙箱消息契约测试（spec §9.4）：
 *  - 父页面 <-> 沙箱的消息必须能被严格解码；结构不符一律抛 DecodeError，不得静默放行；
 *  - 沙箱运行时源码必须与 contract.ts 的 runtimeVersion / 错误码保持同步。
 */
import { describe, expect, it } from "vitest";
import { DecodeError } from "../apis/shared/decode";
import type {
  BuiltMessage,
  CapturesMessage,
  RuntimeEvidence,
  SandboxErrorMessage,
  SandboxPhotoTransfer,
} from "./contract";
import {
  CAPTURE_LIMITS,
  CAPTURE_VIEWS,
  JPEG_DATA_URL_PREFIX,
  RUNTIME_VERSION,
  SANDBOX_CSP,
  SANDBOX_ERROR_CODES,
  SANDBOX_IFRAME_SANDBOX,
  parseParentToSandboxMessage,
  parseSandboxMessage,
} from "./contract";
import { RUNTIME_SOURCE } from "./runtime";

const RUN_ID = "run-contract-test";

const createEvidence = (overrides: Partial<RuntimeEvidence> = {}): RuntimeEvidence => ({
  runtimeVersion: RUNTIME_VERSION,
  buildMs: 3.2,
  texturesMs: 15,
  firstFrameMs: 210,
  fps: 60,
  errors: [],
  photoIdsUsed: ["jeju-coast-001", "jeju-coast-002"],
  photoCount: 2,
  networkAttempts: 0,
  networkAttemptDetails: [],
  cspViolations: [],
  framesRendered: 31,
  canvas: { width: 1125, height: 703 },
  drawStats: { calls: 8, triangles: 120, points: 200 },
  webgl: { version: "WebGL 2.0", renderer: "ANGLE", vendor: "Google Inc.", maxTextureSize: 16384 },
  orbitControls: true,
  sessionElapsedMs: 1500,
  ...overrides,
});

const createBuilt = (): BuiltMessage => ({
  type: "built",
  runId: RUN_ID,
  runtimeVersion: RUNTIME_VERSION,
  buildMs: 3.2,
  texturesMs: 15,
  firstFrameMs: 210,
  photoCount: 2,
});

const createCaptures = (): CapturesMessage => ({
  type: "captures",
  runId: RUN_ID,
  requestId: "capture-1",
  runtimeVersion: RUNTIME_VERSION,
  images: [
    {
      view: CAPTURE_VIEWS[0],
      index: 0,
      dataUrl: `${JPEG_DATA_URL_PREFIX}AAAA`,
      width: 1125,
      height: 703,
    },
    {
      view: CAPTURE_VIEWS[1],
      index: 1,
      dataUrl: `${JPEG_DATA_URL_PREFIX}BBBB`,
      width: 1125,
      height: 703,
    },
    {
      view: CAPTURE_VIEWS[2],
      index: 2,
      dataUrl: `${JPEG_DATA_URL_PREFIX}CCCC`,
      width: 1125,
      height: 703,
    },
    {
      view: CAPTURE_VIEWS[3],
      index: 3,
      dataUrl: `${JPEG_DATA_URL_PREFIX}DDDD`,
      width: 1125,
      height: 703,
    },
  ],
  runtime: createEvidence(),
});

const createSandboxError = (): SandboxErrorMessage => ({
  type: "error",
  runId: RUN_ID,
  code: "BUILD_FAILED",
  phase: "build",
  message: "build(ctx) 抛错",
  errors: [],
});

const createPhotoTransfer = (id: string): SandboxPhotoTransfer => ({
  id,
  width: 2048,
  height: 1365,
  aspect: 2048 / 1365,
  mimeType: "image/jpeg",
  buffer: new ArrayBuffer(16),
});

describe("沙箱契约常量", () => {
  it("runtimeVersion 与 CSP 与 spec §9.4 一致", () => {
    expect(RUNTIME_VERSION).toBe(1);
    expect(SANDBOX_IFRAME_SANDBOX).toBe("allow-scripts");
    expect(SANDBOX_CSP).toBe(
      "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none';",
    );
  });

  it("截图视角是初始视角 + 方位角 90°/180°/270°，硬门禁要求 4 张", () => {
    expect(CAPTURE_VIEWS).toEqual([
      { azimuthDeg: 0, elevationDeg: 0 },
      { azimuthDeg: 90, elevationDeg: 0 },
      { azimuthDeg: 180, elevationDeg: 0 },
      { azimuthDeg: 270, elevationDeg: 0 },
    ]);
    expect(CAPTURE_LIMITS.expectedCount).toBe(CAPTURE_VIEWS.length);
    expect(CAPTURE_LIMITS.maxBytesPerImage).toBe(2 * 1024 * 1024);
    expect(CAPTURE_LIMITS.maxWidth).toBe(1600);
  });
});

describe("沙箱回传消息解码", () => {
  it("接受合法的 built / captures / error / photoselected / escape", () => {
    expect(parseSandboxMessage(createBuilt())).toEqual(createBuilt());
    expect(parseSandboxMessage(createCaptures())).toEqual(createCaptures());
    expect(parseSandboxMessage(createSandboxError())).toEqual(createSandboxError());
    const photoSelected = { type: "photoselected", runId: RUN_ID, photoId: "jeju-coast-003" };
    expect(parseSandboxMessage(photoSelected)).toEqual(photoSelected);
    const escape = { type: "escape", runId: RUN_ID };
    expect(parseSandboxMessage(escape)).toEqual(escape);
  });

  it("拒绝非对象、缺 type 或未知 type", () => {
    expect(() => parseSandboxMessage(null)).toThrow(DecodeError);
    expect(() => parseSandboxMessage("built")).toThrow(DecodeError);
    expect(() => parseSandboxMessage({ runId: RUN_ID })).toThrow(DecodeError);
    expect(() => parseSandboxMessage({ type: "mystery", runId: RUN_ID })).toThrow(DecodeError);
    expect(() => parseSandboxMessage([])).toThrow(DecodeError);
  });

  it("拒绝缺 runId 的 escape（UI-05 转发消息也要严格解码）", () => {
    expect(() => parseSandboxMessage({ type: "escape" })).toThrow(DecodeError);
    expect(() => parseSandboxMessage({ type: "escape", runId: 42 })).toThrow(DecodeError);
  });

  it("拒绝字段类型不符的 built / error", () => {
    expect(() => parseSandboxMessage({ ...createBuilt(), buildMs: "3.2" })).toThrow(DecodeError);
    expect(() => parseSandboxMessage({ ...createBuilt(), runId: 42 })).toThrow(DecodeError);
    expect(() => parseSandboxMessage({ ...createSandboxError(), code: "NOT_A_REAL_CODE" })).toThrow(DecodeError);
    expect(() => parseSandboxMessage({ ...createSandboxError(), errors: "none" })).toThrow(DecodeError);
  });

  it("拒绝非 JPEG data URL、非法尺寸与残缺 runtime 的 captures", () => {
    const captures = createCaptures();
    const notJpeg = {
      ...captures,
      images: [{ ...captures.images[0], dataUrl: "data:image/png;base64,AAAA" }, captures.images[1]],
    };
    expect(() => parseSandboxMessage(notJpeg)).toThrow(DecodeError);

    const zeroWidth = {
      ...captures,
      images: [{ ...captures.images[0], width: 0 }, captures.images[1]],
    };
    expect(() => parseSandboxMessage(zeroWidth)).toThrow(DecodeError);

    const missingFps = {
      ...captures,
      runtime: { ...createEvidence(), fps: undefined },
    };
    expect(() => parseSandboxMessage(missingFps)).toThrow(DecodeError);

    const badRuntimeVersion = {
      ...captures,
      runtime: { ...createEvidence(), runtimeVersion: "1" },
    };
    expect(() => parseSandboxMessage(badRuntimeVersion)).toThrow(DecodeError);
  });
});

describe("父页面发往沙箱的消息解码", () => {
  it("接受合法的 init（含 transfer 后的 ArrayBuffer）与 capture", () => {
    const init = {
      type: "init",
      runId: RUN_ID,
      runtimeVersion: RUNTIME_VERSION,
      photos: [createPhotoTransfer("jeju-coast-001")],
      code: "function build(ctx) { ctx.setBackground(0x000000); }",
      limits: { buildTimeoutMs: 8000, sessionLimitMs: 90000 },
    };
    expect(parseParentToSandboxMessage(init).type).toBe("init");

    const capture = {
      type: "capture",
      runId: RUN_ID,
      requestId: "capture-1",
      views: [{ azimuthDeg: 0, elevationDeg: 0 }],
    };
    expect(parseParentToSandboxMessage(capture)).toEqual(capture);
  });

  it("拒绝空照片、空代码、非 ArrayBuffer 与非数值 limit", () => {
    const baseInit = {
      type: "init",
      runId: RUN_ID,
      runtimeVersion: RUNTIME_VERSION,
      photos: [createPhotoTransfer("jeju-coast-001")],
      code: "function build() {}",
      limits: { buildTimeoutMs: 8000, sessionLimitMs: 90000 },
    };
    expect(() => parseParentToSandboxMessage({ ...baseInit, photos: [] })).toThrow(DecodeError);
    expect(() => parseParentToSandboxMessage({ ...baseInit, code: "   " })).toThrow(DecodeError);
    expect(() =>
      parseParentToSandboxMessage({ ...baseInit, photos: [{ ...createPhotoTransfer("a"), buffer: {} }] }),
    ).toThrow(DecodeError);
    expect(() =>
      parseParentToSandboxMessage({ ...baseInit, limits: { buildTimeoutMs: "8000", sessionLimitMs: 90000 } }),
    ).toThrow(DecodeError);
  });

  it("拒绝缺 requestId 或空 views 的 capture", () => {
    expect(() => parseParentToSandboxMessage({ type: "capture", runId: RUN_ID, views: [] })).toThrow(DecodeError);
    expect(() => parseParentToSandboxMessage({ type: "capture", runId: RUN_ID, requestId: "c", views: [] })).toThrow(
      DecodeError,
    );
  });
});

describe("SceneRuntime 源码与契约同步", () => {
  it("可被沙箱编译执行（new Function 语法检查）", () => {
    expect(() => new Function(RUNTIME_SOURCE)).not.toThrow();
    expect(RUNTIME_SOURCE.length).toBeGreaterThan(1000);
  });

  it("内联错误码与 contract.ts 的 SANDBOX_ERROR_CODES 完全同步", () => {
    for (const code of SANDBOX_ERROR_CODES) {
      expect(RUNTIME_SOURCE).toContain(code);
    }
  });

  it("内联 runtimeVersion 与 contract.ts 一致", () => {
    expect(RUNTIME_SOURCE).toMatch(new RegExp(`RUNTIME_VERSION\\s*=\\s*${RUNTIME_VERSION}\\b`));
  });

  it("内联 Esc 转发监听（焦点在沙箱内时按键传不到父页面，UI-05）", () => {
    expect(RUNTIME_SOURCE).toContain('type: "escape"');
    expect(RUNTIME_SOURCE).toContain('event.key === "Escape"');
  });
});
