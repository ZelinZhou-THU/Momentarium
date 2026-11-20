import { ApiError } from "../../../../../apis/shared/ApiError";
import type { ApiErrorReason } from "../../../../../apis/shared/ApiError";
import { describeApiError } from "../../../../../apis/shared/describeApiError";
import type { PhotoLocationCandidate } from "../../../../../objects/curation/PhotoLocationCandidatesResponse";
import type { LocationGranularity } from "../../../../../objects/gallery/PhotoLocationView";

/** 候选有没有可用于 area/exact 的坐标。 */
export const candidateHasCoordinates = (candidate: PhotoLocationCandidate): boolean =>
  candidate.latitude !== null && candidate.longitude !== null;

/** 候选坐标展示：无坐标时明确“仅名称”，不假装有位置。 */
export const describeCandidateCoordinates = (candidate: PhotoLocationCandidate): string =>
  candidateHasCoordinates(candidate)
    ? `WGS84 ${candidate.latitude!.toFixed(5)}, ${candidate.longitude!.toFixed(5)}`
    : "仅名称（无坐标）";

/** 候选建议的粒度文案（候选自身可空；确认时由作者另选）。 */
export const describeCandidateGranularity = (candidate: PhotoLocationCandidate): string => {
  if (!candidateHasCoordinates(candidate)) {
    return "没有坐标，只能保存为不公开的地点名称";
  }
  if (candidate.granularity === "area") {
    return "建议公开范围";
  }
  if (candidate.granularity === "exact") {
    return "建议公开精确点";
  }
  return "可选择公开范围或精确点";
};

/** 采用候选时默认选中的粒度：无坐标只能 hidden；有坐标优先候选建议。 */
export const defaultConfirmGranularity = (
  candidate: PhotoLocationCandidate,
): LocationGranularity => {
  if (!candidateHasCoordinates(candidate)) {
    return "hidden";
  }
  return candidate.granularity ?? "area";
};

/** 采用候选时的粒度选项：无坐标只允许 hidden，area/exact 明确禁用。 */
export interface CandidateGranularityChoice {
  readonly value: LocationGranularity;
  readonly disabled: boolean;
}

export const candidateGranularityChoices = (
  candidate: PhotoLocationCandidate,
): readonly CandidateGranularityChoice[] => {
  const hasCoordinates = candidateHasCoordinates(candidate);
  return [
    { value: "hidden", disabled: false },
    { value: "area", disabled: !hasCoordinates },
    { value: "exact", disabled: !hasCoordinates },
  ];
};

const CANDIDATE_REASON_MESSAGES: Partial<Record<ApiErrorReason, string>> = {
  LOCATION_COORDINATES_INVALID: "这张候选没有坐标，只能选择「不公开」保存地点名称",
  LOCATION_GRANULARITY_INVALID: "公开粒度无效；请选择不公开、范围或精确点",
};

/**
 * 候选相关错误文案：坐标/粒度 reason 优先；MODEL_FAILURE/NOT_FOUND 给出可重试或重新识别的提示；
 * 其余兜底登录失效提示。失败不阻断手动编辑。
 */
export const describeCandidateError = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.code === "MODEL_FAILURE") {
      return "AI 地点识别暂时失败；可以稍后重试，或直接手动填写位置。";
    }
    if (error.code === "NOT_FOUND") {
      return "候选已失效（可能已被 AI 重跑替换）；请重新读取候选或重新识别。";
    }
    if (error.code === "UPSTREAM_UNAVAILABLE") {
      return "AI 地点识别服务暂时不可用；可以稍后重试或手动填写位置。";
    }
  }
  return describeApiError(error, CANDIDATE_REASON_MESSAGES, "登录状态已失效，请重新登录");
};
