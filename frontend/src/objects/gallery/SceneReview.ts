import {
  requireObject,
  requireOneOf,
  requireString,
  requireStringArray,
} from "../../apis/shared/decode";
import { parseRubricScores } from "./RubricScores";
import type { RubricScores } from "./RubricScores";

/** 契约 §4.1 SceneReview(scores, verdict, issues, summary)。 */
export type SceneReviewVerdict = "pass" | "revise";

const SCENE_REVIEW_VERDICTS: readonly SceneReviewVerdict[] = ["pass", "revise"];

export interface SceneReview {
  readonly scores: RubricScores;
  readonly verdict: SceneReviewVerdict;
  readonly issues: string[];
  readonly summary: string;
}

export const parseSceneReview = (value: unknown, path = "review"): SceneReview => {
  const record = requireObject(value, path);
  return {
    scores: parseRubricScores(record.scores, `${path}.scores`),
    verdict: requireOneOf(record.verdict, SCENE_REVIEW_VERDICTS, `${path}.verdict`),
    issues: requireStringArray(record.issues, `${path}.issues`),
    summary: requireString(record.summary, `${path}.summary`),
  };
};
