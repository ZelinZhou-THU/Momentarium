import { describe, expect, it } from "vitest";
import {
  createSceneBriefFixture,
  createSceneReviewFixture,
  createSceneRunFixture,
} from "../../../../../scene/mocks/sceneRunFixtures";
import type { ScenePanelState } from "../objects/ScenePanelState";
import { describeSceneStage } from "./describeSceneStage";

const generating = (run: NonNullable<ScenePanelState["run"]>): ScenePanelState => ({
  status: "generating",
  run,
  message: null,
  captureAttempt: 0,
});

describe("场景生成阶段文案", () => {
  it("还没有题面：正在生成题面", () => {
    expect(describeSceneStage(generating(createSceneRunFixture())).title).toBe("正在生成题面");
  });

  it("题面已落库、首次生成：正在写场景代码", () => {
    const stage = describeSceneStage(generating(createSceneRunFixture({ brief: createSceneBriefFixture() })));
    expect(stage.title).toBe("正在写场景代码");
    expect(stage.step).toBe(2);
  });

  it("修订中：标明第几次修订和依据的评审意见条数", () => {
    const review = createSceneReviewFixture();
    const stage = describeSceneStage(
      generating(createSceneRunFixture({ brief: createSceneBriefFixture(), attempts: 2, review })),
    );
    expect(stage.title).toBe("正在修订场景代码（第 2 次）");
    expect(stage.description).toContain(`${review.issues.length} 条意见`);
  });

  it("AI 场景成功：场景生成完成、已通过评审（UI-04）", () => {
    const stage = describeSceneStage({
      status: "succeeded",
      run: createSceneRunFixture({ status: "succeeded", source: "ai", code: "function build(ctx) {}" }),
      message: null,
      captureAttempt: 0,
    });
    expect(stage.title).toBe("场景生成完成");
    expect(stage.description).toContain("已通过评审");
  });

  it("兜底场景（修订额度用尽回退）不写“已通过评审”（UI-04）", () => {
    const stage = describeSceneStage({
      status: "succeeded",
      run: createSceneRunFixture({ status: "succeeded", source: "fallback", code: "function build(ctx) {}" }),
      message: null,
      captureAttempt: 0,
    });
    expect(stage.title).toBe("已回退兜底场景");
    expect(stage.description).not.toContain("已通过评审");
    expect(stage.description).toContain("兜底");
    expect(stage.step).toBe(5);
  });
});
