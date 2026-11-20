import { describe, expect, it } from "vitest";
import {
  describeInstructionCount,
  explainRevisionBlocked,
  SCENE_INSTRUCTION_MAX_LENGTH,
  validateSceneInstruction,
} from "./sceneRevision";

describe("场景修订指令校验（v1.14）", () => {
  it("trim 后 1–500 码点；允许中文、换行与制表符", () => {
    expect(validateSceneInstruction("  把灯塔调亮  ")).toEqual({
      ok: true,
      instruction: "把灯塔调亮",
    });
    expect(validateSceneInstruction("第一行\n第二行\t细节").ok).toBe(true);
    expect(validateSceneInstruction("").ok).toBe(false);
    expect(validateSceneInstruction("   ").ok).toBe(false);
    expect(validateSceneInstruction("a".repeat(SCENE_INSTRUCTION_MAX_LENGTH)).ok).toBe(true);
    expect(validateSceneInstruction("a".repeat(SCENE_INSTRUCTION_MAX_LENGTH + 1)).ok).toBe(false);
    // emoji 按码点计 1，不按 UTF-16 长度计 2。
    expect(validateSceneInstruction("🌊".repeat(SCENE_INSTRUCTION_MAX_LENGTH)).ok).toBe(true);
  });

  it("拒绝 NUL 等控制字符，但保留换行/制表符", () => {
    expect(validateSceneInstruction("雾\u0000淡一点").ok).toBe(false);
    expect(validateSceneInstruction("雾\u0007淡一点").ok).toBe(false);
    expect(validateSceneInstruction("雾\u007f淡一点").ok).toBe(false);
    expect(validateSceneInstruction("雾\u0085淡一点").ok).toBe(false);
    expect(validateSceneInstruction("雾\n淡一点").ok).toBe(true);
  });

  it("字数展示 500 上限", () => {
    expect(describeInstructionCount("🌊abc")).toBe("4/500 字");
  });
});

describe("修订阻断原因", () => {
  const current = { code: "scene-code" };

  it("没有结构性阻碍时返回 null", () => {
    expect(
      explainRevisionBlocked({ currentRun: current, hasActiveRun: false, sceneStale: false }),
    ).toBeNull();
  });

  it("素材已变化（过期）时禁止修订并说明要先重新生成", () => {
    expect(
      explainRevisionBlocked({ currentRun: current, hasActiveRun: false, sceneStale: true }),
    ).toContain("重新生成");
  });

  it("无当前场景 / 无代码 / 正在生成各有自己的原因，且优先于过期", () => {
    expect(
      explainRevisionBlocked({ currentRun: null, hasActiveRun: false, sceneStale: true }),
    ).toContain("还没有当前采用场景");
    expect(
      explainRevisionBlocked({ currentRun: { code: null }, hasActiveRun: false, sceneStale: true }),
    ).toContain("没有可修订的代码");
    expect(
      explainRevisionBlocked({ currentRun: current, hasActiveRun: true, sceneStale: true }),
    ).toContain("正在生成");
  });
});
