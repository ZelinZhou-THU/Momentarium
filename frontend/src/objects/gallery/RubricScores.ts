import { requireNumber, requireObject } from "../../apis/shared/decode";

/** 契约 §4.1 RubricScores：五项评分，1–5。 */
export interface RubricScores {
  readonly moodMatch: number;
  readonly photoPresence: number;
  readonly composition: number;
  readonly lightingColor: number;
  readonly completeness: number;
}

export const parseRubricScores = (value: unknown, path = "scores"): RubricScores => {
  const record = requireObject(value, path);
  return {
    moodMatch: requireNumber(record.moodMatch, `${path}.moodMatch`),
    photoPresence: requireNumber(record.photoPresence, `${path}.photoPresence`),
    composition: requireNumber(record.composition, `${path}.composition`),
    lightingColor: requireNumber(record.lightingColor, `${path}.lightingColor`),
    completeness: requireNumber(record.completeness, `${path}.completeness`),
  };
};
