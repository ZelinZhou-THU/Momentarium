import { describe, expect, it } from "vitest";
import { createSceneRunFixture } from "../../../../../scene/mocks/sceneRunFixtures";
import {
  SCENE_SLOW_POLL_AFTER_MS,
  SCENE_SLOW_POLL_INTERVAL_MS,
  describeSceneProgress,
  formatSceneDuration,
  scenePollDelayMs,
} from "./describeSceneProgress";

const createdAt = "2026-10-29T06:00:00Z";
const at = (offsetMs: number): number => Date.parse(createdAt) + offsetMs;

describe("场景生成进度", () => {
  it("时长文案：秒 / 分秒 / 时分", () => {
    expect(formatSceneDuration(45_000)).toBe("45 秒");
    expect(formatSceneDuration(185_000)).toBe("3 分 05 秒");
    expect(formatSceneDuration(3_720_000)).toBe("1 小时 02 分");
    expect(formatSceneDuration(-5)).toBe("0 秒");
  });

  it("轮询不超时，只在 3 分钟后放慢", () => {
    expect(scenePollDelayMs(10_000, 2_000)).toBe(2_000);
    expect(scenePollDelayMs(SCENE_SLOW_POLL_AFTER_MS + 1, 2_000)).toBe(SCENE_SLOW_POLL_INTERVAL_MS);
    expect(scenePollDelayMs(SCENE_SLOW_POLL_AFTER_MS + 1, 30_000)).toBe(30_000);
  });

  it("进行中：以 createdAt 计已用时间，超过 3 分钟标记比平时久", () => {
    const run = createSceneRunFixture({ status: "generating", createdAt });
    expect(describeSceneProgress("generating", run, at(80_000))).toEqual({
      elapsedLabel: "已用 1 分 20 秒",
      attemptLabel: null,
      isLongRunning: false,
    });
    expect(describeSceneProgress("generating", run, at(SCENE_SLOW_POLL_AFTER_MS + 1_000)).isLongRunning).toBe(
      true,
    );
    // 本地 capturing 阶段同样计时，避免截图期间计时闪断。
    expect(describeSceneProgress("capturing", run, at(5_000)).elapsedLabel).toBe("已用 5 秒");
    // capturing 没有停止按钮，不给"比平时久，可停止"的提示。
    expect(describeSceneProgress("capturing", run, at(SCENE_SLOW_POLL_AFTER_MS + 1_000)).isLongRunning).toBe(false);
  });

  it("修订轮次与完成用时", () => {
    const run = createSceneRunFixture({
      status: "succeeded",
      attempts: 2,
      createdAt,
      updatedAt: "2026-10-29T06:04:30Z",
    });
    expect(describeSceneProgress("succeeded", run, at(999_999))).toEqual({
      elapsedLabel: "用时 4 分 30 秒",
      attemptLabel: "第 2 次修订",
      isLongRunning: false,
    });
  });

  it("无运行 / 失败 / 时间无法解析时不显示计时", () => {
    expect(describeSceneProgress("idle", null, at(0)).elapsedLabel).toBeNull();
    expect(
      describeSceneProgress("failed", createSceneRunFixture({ status: "failed", createdAt }), at(1_000))
        .elapsedLabel,
    ).toBeNull();
    expect(
      describeSceneProgress("generating", createSceneRunFixture({ createdAt: "not-a-date" }), at(1_000))
        .elapsedLabel,
    ).toBeNull();
  });
});
