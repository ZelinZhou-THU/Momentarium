import { describe, expect, it } from "vitest";
import { createSceneReviewFixture, createSceneRunFixture } from "../../../../../scene/mocks/sceneRunFixtures";
import { canViewSceneImmersive, describeImmersiveSceneMeta } from "./immersiveScene";

describe("沉浸观看", () => {
  it("只在评审通过且沙箱在预览时可进入；生成、截图、评审期间不行", () => {
    expect(canViewSceneImmersive("succeeded", true)).toBe(true);
    expect(canViewSceneImmersive("succeeded", false)).toBe(false);
    expect(canViewSceneImmersive("awaiting_capture", true)).toBe(false);
    expect(canViewSceneImmersive("capturing", true)).toBe(false);
    expect(canViewSceneImmersive("reviewing", true)).toBe(false);
    expect(canViewSceneImmersive("generating", false)).toBe(false);
  });

  it("场景说明：来源 · 修订轮次 · 评审结论", () => {
    expect(
      describeImmersiveSceneMeta(
        createSceneRunFixture({ source: "ai", attempts: 0, review: createSceneReviewFixture({ verdict: "pass" }) }),
      ),
    ).toBe("AI 场景 · 评审通过");
    expect(
      describeImmersiveSceneMeta(createSceneRunFixture({ source: "fallback", attempts: 2, review: null })),
    ).toBe("兜底场景 · 第 2 次修订");
  });
});
