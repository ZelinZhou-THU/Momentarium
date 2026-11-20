import { describe, expect, it } from "vitest";
import { describeReviewIssue, reviewIssuesHeading } from "./describeReviewIssue";

describe("评审意见展示", () => {
  it("维度｜证据｜改法：维度换成中文名，证据和改法分开", () => {
    expect(describeReviewIssue("composition｜首屏中部偏左，正对圆门｜把这棵树移到门侧后方")).toEqual({
      dimension: "空间构图",
      location: "首屏中部偏左，正对圆门",
      suggestion: "把这棵树移到门侧后方",
    });
    expect(describeReviewIssue("lightingColor | 右前方屋墙 | 提亮窗内暖光").dimension).toBe("光影色彩");
  });

  it("只有两段时没有位置；多于三段时其余并入改法", () => {
    expect(describeReviewIssue("completeness｜补齐晾衣绳的连接")).toEqual({
      dimension: "完成度",
      location: null,
      suggestion: "补齐晾衣绳的连接",
    });
    expect(describeReviewIssue("moodMatch｜远景｜加雾｜压暗天空").suggestion).toBe("加雾；压暗天空");
  });

  it("未知格式原样展示，不猜维度", () => {
    expect(describeReviewIssue("左侧远景偏暗，可补一盏暖色轮廓光")).toEqual({
      dimension: null,
      location: null,
      suggestion: "左侧远景偏暗，可补一盏暖色轮廓光",
    });
    expect(describeReviewIssue("场景代码在构建阶段崩溃｜第 3 行").dimension).toBeNull();
  });

  it("标题区分通过后的建议与未通过的问题", () => {
    expect(reviewIssuesHeading("pass")).toContain("继续改善");
    expect(reviewIssuesHeading("revise")).toBe("评审指出的问题");
  });
});
