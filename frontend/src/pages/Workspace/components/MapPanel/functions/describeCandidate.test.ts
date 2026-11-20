import { describe, expect, it } from "vitest";
import { ApiError } from "../../../../../apis/shared/ApiError";
import {
  candidateGranularityChoices,
  candidateHasCoordinates,
  defaultConfirmGranularity,
  describeCandidateCoordinates,
  describeCandidateError,
  describeCandidateGranularity,
} from "./describeCandidate";
import type { PhotoLocationCandidate } from "../../../../../objects/curation/PhotoLocationCandidatesResponse";

const candidate = (overrides: Partial<PhotoLocationCandidate> = {}): PhotoLocationCandidate => ({
  id: "cand-1",
  name: "济州岛 · 涉地可支",
  latitude: 33.4592,
  longitude: 126.936,
  granularity: "area",
  reason: "海岸悬崖与灯塔的组合与该地标一致",
  ...overrides,
});

describe("AI 地点候选展示与确认约束", () => {
  it("有坐标候选显示 WGS84，无坐标明确“仅名称”", () => {
    expect(describeCandidateCoordinates(candidate())).toContain("33.45920");
    const nameOnly = candidate({ latitude: null, longitude: null, granularity: null });
    expect(candidateHasCoordinates(nameOnly)).toBe(false);
    expect(describeCandidateCoordinates(nameOnly)).toBe("仅名称（无坐标）");
    expect(describeCandidateGranularity(nameOnly)).toContain("只能保存为不公开");
    expect(describeCandidateGranularity(candidate())).toContain("建议公开范围");
  });

  it("采用粒度：无坐标只能 hidden，有坐标默认候选建议", () => {
    const nameOnly = candidate({ latitude: null, longitude: null, granularity: null });
    expect(defaultConfirmGranularity(nameOnly)).toBe("hidden");
    expect(candidateGranularityChoices(nameOnly)).toEqual([
      { value: "hidden", disabled: false },
      { value: "area", disabled: true },
      { value: "exact", disabled: true },
    ]);
    expect(defaultConfirmGranularity(candidate())).toBe("area");
    expect(defaultConfirmGranularity(candidate({ granularity: "exact" }))).toBe("exact");
    expect(candidateGranularityChoices(candidate())).toEqual([
      { value: "hidden", disabled: false },
      { value: "area", disabled: false },
      { value: "exact", disabled: false },
    ]);
  });

  it("错误文案：模型失败/候选失效/无坐标/粒度不合法都可读且可重试", () => {
    const modelFailure = new ApiError({
      status: 502,
      code: "MODEL_FAILURE",
      reason: null,
      message: "backend",
    });
    expect(describeCandidateError(modelFailure)).toContain("AI 地点识别暂时失败");
    const missing = new ApiError({
      status: 404,
      code: "NOT_FOUND",
      reason: null,
      message: "backend",
    });
    expect(describeCandidateError(missing)).toContain("候选已失效");
    const noCoordinates = new ApiError({
      status: 400,
      code: "VALIDATION",
      reason: "LOCATION_COORDINATES_INVALID",
      message: "backend",
    });
    expect(describeCandidateError(noCoordinates)).toContain("只能选择「不公开」");
    const invalidGranularity = new ApiError({
      status: 400,
      code: "VALIDATION",
      reason: "LOCATION_GRANULARITY_INVALID",
      message: "backend",
    });
    expect(describeCandidateError(invalidGranularity)).toContain("公开粒度无效");
  });
});
