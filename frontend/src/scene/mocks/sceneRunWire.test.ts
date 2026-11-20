import { describe, expect, it } from "vitest";
import { DecodeError } from "../../apis/shared/decode";
import { parseSceneRunView } from "../../objects/gallery/SceneRunView";
import { SCENE_RUN_AWAITING_CAPTURE_WIRE_FIXTURE } from "./sceneRunAwaitingWire.fixture";
import { SCENE_RUN_SUCCEEDED_FIXTURE, SCENE_RUNTIME_EVIDENCE_WIRE_FIXTURE } from "./sceneRunWire.fixture";

/**
 * 后端 wire 形状回归：用服务端风格的 SceneRunView（所有 Option 显式 null，不省略字段）
 * 验证前端 decode 与 reviewscene 的 RuntimeEvidence 请求形状。真实后端就绪后会用
 * getscenerun 的实测响应替换/补充本夹具（见 task-31 证据）。
 */
describe("SceneRunView 服务端 wire 形状解码", () => {
  it("解码成功且保留全部字段（含嵌套 brief/review）", () => {
    const decoded = parseSceneRunView(SCENE_RUN_SUCCEEDED_FIXTURE);
    expect(decoded).toEqual(SCENE_RUN_SUCCEEDED_FIXTURE);
    expect(decoded.brief?.palette).toHaveLength(3);
    expect(decoded.review?.scores.photoPresence).toBe(5);
  });

  it("Option 字段缺失（不是显式 null）时拒绝——防止后端省略 null 的回归", () => {
    expect(() => parseSceneRunView({ ...SCENE_RUN_SUCCEEDED_FIXTURE, hint: undefined })).toThrow(DecodeError);
    expect(() => parseSceneRunView({ ...SCENE_RUN_SUCCEEDED_FIXTURE, review: undefined })).toThrow(DecodeError);
  });

  it("非法状态或错类型立即拒绝", () => {
    expect(() => parseSceneRunView({ ...SCENE_RUN_SUCCEEDED_FIXTURE, status: "done" })).toThrow(DecodeError);
    expect(() => parseSceneRunView({ ...SCENE_RUN_SUCCEEDED_FIXTURE, photoIds: "x" })).toThrow(DecodeError);
  });

  it("reviewscene 的 RuntimeEvidence 请求形状与契约 §4.1 一致", () => {
    expect(Object.keys(SCENE_RUNTIME_EVIDENCE_WIRE_FIXTURE).sort()).toEqual([
      "buildMs",
      "errors",
      "fps",
      "networkAttempts",
      "photoIdsUsed",
    ]);
    expect(typeof SCENE_RUNTIME_EVIDENCE_WIRE_FIXTURE.buildMs).toBe("number");
    expect(Array.isArray(SCENE_RUNTIME_EVIDENCE_WIRE_FIXTURE.errors)).toBe(true);
  });
});

describe("真实后端 wire 回归（D4 E2E 实测响应）", () => {
  it("8080 getscenerun(awaiting_capture) 实测响应可被前端解码", () => {
    const decoded = parseSceneRunView(SCENE_RUN_AWAITING_CAPTURE_WIRE_FIXTURE);
    expect(decoded.status).toBe("awaiting_capture");
    expect(decoded.source).toBe("ai");
    expect(decoded.attempts).toBe(0);
    expect(decoded.hint).toBe("像退潮后的海边，安静、潮湿、有一点怀念。");
    expect(decoded.photoIds).toHaveLength(3);
    expect(decoded.review).toBeNull();
    expect(decoded.errorCode).toBeNull();
    expect(decoded.errorMessage).toBeNull();
    expect(decoded.code).toContain("function build(ctx)");
    expect(decoded.brief?.palette).toEqual(["#1B2A4A", "#F2A65A", "#E8D5B7"]);
    expect(Number.isNaN(Date.parse(decoded.updatedAt))).toBe(false);
  });
});
