import { describe, expect, it } from "vitest";
import type { RuntimeEvidence } from "../contract";
import { createRuntimeEvidenceFixture } from "../mocks/sceneRunFixtures";
import { toSceneRuntimeEvidence } from "./toSceneRuntimeEvidence";

describe("客户端运行时证据 → 契约 §4.1 RuntimeEvidence", () => {
  it("只保留契约字段并做必要取整", () => {
    const mapped = toSceneRuntimeEvidence(createRuntimeEvidenceFixture());
    expect(mapped).toEqual({
      buildMs: 3,
      fps: 58.2,
      errors: [],
      photoIdsUsed: ["photo-1", "photo-2", "photo-3"],
      networkAttempts: 0,
    });
  });

  it("errors 扁平化成字符串（phase/name/message），便于服务端硬门禁展示", () => {
    const evidence: RuntimeEvidence = {
      ...createRuntimeEvidenceFixture(),
      errors: [
        { phase: "build", name: "TypeError", message: "x is undefined", stack: "at build", atMs: 12 },
        { phase: "frame", name: "Error", message: "boom", stack: null, atMs: 34 },
      ],
    };
    const mapped = toSceneRuntimeEvidence(evidence);
    expect(mapped.errors).toEqual(["build: TypeError: x is undefined", "frame: Error: boom"]);
  });

  it("缺失 buildMs/fps 时回退为 0（服务端字段非空）", () => {
    const mapped = toSceneRuntimeEvidence({
      ...createRuntimeEvidenceFixture(),
      buildMs: null,
      fps: null,
    });
    expect(mapped.buildMs).toBe(0);
    expect(mapped.fps).toBe(0);
  });

  it("photoIdsUsed 复制为新数组，不共享引用", () => {
    const evidence = createRuntimeEvidenceFixture();
    const mapped = toSceneRuntimeEvidence(evidence);
    expect(mapped.photoIdsUsed).not.toBe(evidence.photoIdsUsed);
    expect(mapped.photoIdsUsed).toEqual(evidence.photoIdsUsed);
  });
});
