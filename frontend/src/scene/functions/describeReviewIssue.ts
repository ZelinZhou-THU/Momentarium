import { RUBRIC_LABELS } from "../objects/ReviewRubric";

/** 一条评审意见的展示结构：维度中文名、画面位置（证据）、改法。 */
export interface ReviewIssueView {
  /** 识别出的评分维度中文名；未知格式为 null（原文整句放在 suggestion）。 */
  readonly dimension: string | null;
  /** 截图中的位置 / 证据；没有时为 null。 */
  readonly location: string | null;
  readonly suggestion: string;
}

const SEPARATOR = /\s*[｜|]\s*/;

const dimensionLabel = (key: string): string | null =>
  RUBRIC_LABELS.find((item) => item.key === key.trim())?.label ?? null;

/**
 * 评审意见字符串 → 展示结构（纯函数）。评审提示词要求的格式是 `维度｜截图证据｜改法`，
 * 维度是英文 rubric 键；只有首段是已知维度时才拆分，其它格式原样展示，不猜。
 */
export const describeReviewIssue = (issue: string): ReviewIssueView => {
  const [head = "", ...rest] = issue.split(SEPARATOR);
  const dimension = dimensionLabel(head);
  if (dimension === null || rest.length === 0) {
    return { dimension: null, location: null, suggestion: issue.trim() };
  }
  return rest.length === 1
    ? { dimension, location: null, suggestion: rest[0] ?? "" }
    : { dimension, location: rest[0] ?? null, suggestion: rest.slice(1).join("；") };
};

/** 结果区意见列表的标题：通过时是"可继续改善"，未通过（兜底）时是"评审指出的问题"。 */
export const reviewIssuesHeading = (verdict: "pass" | "revise"): string =>
  verdict === "pass" ? "已达到通过线，下面是还可以继续改善的地方" : "评审指出的问题";
