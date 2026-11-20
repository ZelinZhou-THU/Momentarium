import { describe, expect, it } from "vitest";
import { createSucceededSceneRunFixture } from "../../../../../scene/mocks/sceneRunFixtures";
import { isPreviewActive, scenePreparationTarget, shouldPrepareScenePhotos } from "./reduceScenePanel";

describe("场景图片准备时机", () => {
  it("隐藏时跳过已完成场景预览，截图及评审阶段继续准备", () => {
    expect(shouldPrepareScenePhotos(false, "succeeded")).toBe(false);
    expect(shouldPrepareScenePhotos(false, "failed")).toBe(false);
    expect(shouldPrepareScenePhotos(false, "awaiting_capture")).toBe(true);
    expect(shouldPrepareScenePhotos(false, "capturing")).toBe(true);
    expect(shouldPrepareScenePhotos(false, "reviewing")).toBe(true);
    expect(shouldPrepareScenePhotos(true, "succeeded")).toBe(true);
  });
  it("截图进行中仍属于活动运行，预览必须继续指向该运行", () => {
    expect(isPreviewActive("capturing")).toBe(true);
    expect(isPreviewActive("succeeded")).toBe(true);
    expect(isPreviewActive("failed")).toBe(false);
  });
  it("放弃候选后为当前场景准备图片，新候选仍使用自己的图片", () => {
    const current = { ...createSucceededSceneRunFixture(), runId: "current" };
    const candidate = { ...createSucceededSceneRunFixture(), runId: "candidate", kind: "revise" as const, isCurrent: false };
    const state = { status: "succeeded" as const, run: candidate, message: null, captureAttempt: 0 };
    expect(scenePreparationTarget(state, current, null)).toBe(candidate);
    expect(scenePreparationTarget(state, current, "candidate")).toBe(current);
    expect(scenePreparationTarget(state, current, "other")).toBe(candidate);
    expect(scenePreparationTarget({ ...state, run: { ...candidate, dismissed: true } }, current)).toBe(current);
  });
});
