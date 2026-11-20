/**
 * 截图证据链测试（spec §9.4/§9.5）：截图请求构造、JPEG data URL 估算与客户端硬门禁预检。
 */
import { describe, expect, it } from "vitest";
import type { CaptureView, ImageCapture, RuntimeEvidence } from "./contract";
import { CAPTURE_VIEWS, JPEG_DATA_URL_PREFIX, RUNTIME_VERSION } from "./contract";
import {
  CAPTURE_VIEW_LABELS,
  auditSceneCapture,
  collectSceneCapture,
  createCaptureRequest,
  estimateDataUrlBytes,
  isJpegDataUrl,
} from "./capture";

const createEvidence = (overrides: Partial<RuntimeEvidence> = {}): RuntimeEvidence => ({
  runtimeVersion: RUNTIME_VERSION,
  buildMs: 3.2,
  texturesMs: 15,
  firstFrameMs: 210,
  fps: 60,
  errors: [],
  photoIdsUsed: ["photo-1", "photo-2"],
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

const createCapture = (index: number, overrides: Partial<ImageCapture> = {}): ImageCapture => ({
  view: CAPTURE_VIEWS[index],
  index,
  dataUrl: `${JPEG_DATA_URL_PREFIX}${"A".repeat(1024)}`,
  width: 1125,
  height: 703,
  ...overrides,
});

const createCaptures = (): ImageCapture[] => [createCapture(0), createCapture(1), createCapture(2), createCapture(3)];

describe("截图请求", () => {
  it("默认使用环绕四个视角且不共享引用", () => {
    const request = createCaptureRequest("run-1", "capture-1");
    expect(request.type).toBe("capture");
    expect(request.views).toEqual(CAPTURE_VIEWS);
    expect(request.views).not.toBe(CAPTURE_VIEWS);
  });

  it("支持自定义视角并保持输入顺序", () => {
    const views: CaptureView[] = [{ azimuthDeg: 90, elevationDeg: 12 }];
    const request = createCaptureRequest("run-1", "capture-2", views);
    expect(request.views).toEqual([{ azimuthDeg: 90, elevationDeg: 12 }]);
  });

  it("视角文案与视角数量一致", () => {
    expect(CAPTURE_VIEW_LABELS).toHaveLength(CAPTURE_VIEWS.length);
  });
});

describe("JPEG data URL 工具", () => {
  it("按 base64 长度估算字节数（含 padding）", () => {
    expect(estimateDataUrlBytes(`${JPEG_DATA_URL_PREFIX}AAAA`)).toBe(3);
    expect(estimateDataUrlBytes(`${JPEG_DATA_URL_PREFIX}AAA=`)).toBe(2);
    expect(estimateDataUrlBytes("not-a-data-url")).toBe(0);
  });

  it("只接受 JPEG data URL", () => {
    expect(isJpegDataUrl(`${JPEG_DATA_URL_PREFIX}AAAA`)).toBe(true);
    expect(isJpegDataUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isJpegDataUrl("blob:http://localhost/abc")).toBe(false);
  });
});

describe("客户端硬门禁预检", () => {
  it("证据齐全时通过", () => {
    const audit = auditSceneCapture(createCaptures(), createEvidence());
    expect(audit).toEqual({ passed: true, issues: [] });
  });

  it("运行时错误、联网、低 fps 都会被拒绝", () => {
    const evidence = createEvidence({
      errors: [{ phase: "build", name: "Error", message: "boom", stack: null, atMs: 1 }],
      photoIdsUsed: ["photo-1"],
      networkAttempts: 2,
      fps: 12,
    });
    const audit = auditSceneCapture(createCaptures(), evidence);
    expect(audit.passed).toBe(false);
    const codes = audit.issues.map((issue) => issue.code);
    expect(codes).toContain("RUNTIME_ERRORS");
    expect(codes).toContain("NETWORK_ATTEMPTS");
    expect(codes).toContain("FPS_TOO_LOW");
  });

  it("纯场景：生成代码不使用照片不再视为预检失败（旧场景用照片仍可渲染）", () => {
    const unused = auditSceneCapture(createCaptures(), createEvidence({ photoIdsUsed: [] }));
    expect(unused.passed).toBe(true);
    expect(unused.issues).toEqual([]);

    const partlyUsed = auditSceneCapture(
      createCaptures(),
      createEvidence({ photoIdsUsed: ["photo-1"] }),
    );
    expect(partlyUsed.passed).toBe(true);
  });

  it("截图数量、格式、尺寸与 runtimeVersion 不符都会被拒绝", () => {
    const tooWide = createCaptures().map((capture) => ({ ...capture, width: 2400 }));
    const audit = auditSceneCapture(
      [
        createCapture(0, { dataUrl: "data:image/png;base64,AAAA" }),
        ...tooWide.slice(1),
      ],
      createEvidence({ runtimeVersion: 9 }),
    );
    const codes = audit.issues.map((issue) => issue.code);
    expect(codes).toContain("CAPTURE_NOT_JPEG");
    expect(codes).toContain("CAPTURE_TOO_WIDE");
    expect(codes).toContain("RUNTIME_VERSION_MISMATCH");

    const onlyOne = auditSceneCapture([createCapture(0)], createEvidence());
    expect(onlyOne.issues.map((issue) => issue.code)).toContain("CAPTURE_COUNT");
  });

  it("fps 缺失也视为未通过（采样不足）", () => {
    const audit = auditSceneCapture(createCaptures(), createEvidence({ fps: null }));
    expect(audit.issues.map((issue) => issue.code)).toContain("FPS_UNAVAILABLE");
  });

  it("collectSceneCapture 汇总截图、证据与预检", () => {
    const message = {
      type: "captures" as const,
      runId: "run-1",
      requestId: "capture-1",
      runtimeVersion: RUNTIME_VERSION,
      images: createCaptures(),
      runtime: createEvidence(),
    };
    const collection = collectSceneCapture(message);
    expect(collection.captures).toHaveLength(4);
    expect(collection.audit.passed).toBe(true);
    expect(collection.runtime.photoIdsUsed).toEqual(["photo-1", "photo-2"]);
  });
});
