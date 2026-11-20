import {
  requireArray,
  requireNullable,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from "../../apis/shared/decode";

/** 契约 v1.13 候选建议的公开粒度（AI 只给 area/exact 建议；确认时可改为 hidden）。 */
export type CandidateGranularity = "area" | "exact";
const CANDIDATE_GRANULARITIES: readonly CandidateGranularity[] = ["area", "exact"];

/** 契约 v1.13 PhotoLocationCandidate：AI 识别出的一个地点候选，确认前不进入地图/快照。 */
export interface PhotoLocationCandidate {
  readonly id: string;
  readonly name: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** 建议公开粒度；仅名称候选为 null（确认时只能 hidden）。 */
  readonly granularity: CandidateGranularity | null;
  readonly reason: string;
}

export const parsePhotoLocationCandidate = (
  value: unknown,
  path = "photoLocationCandidate",
): PhotoLocationCandidate => {
  const record = requireObject(value, path);
  return {
    id: requireString(record.id, `${path}.id`),
    name: requireString(record.name, `${path}.name`),
    latitude: requireNullable(record.latitude, `${path}.latitude`, requireNumber),
    longitude: requireNullable(record.longitude, `${path}.longitude`, requireNumber),
    granularity: requireNullable(
      record.granularity,
      `${path}.granularity`,
      (inner, innerPath) => requireOneOf(inner, CANDIDATE_GRANULARITIES, innerPath),
    ),
    reason: requireString(record.reason, `${path}.reason`),
  };
};

/** 契约 v1.13 候选响应：suggest 与 getphotolocationcandidates 共用；model/generatedAt 可空。 */
export interface PhotoLocationCandidatesResponse {
  readonly photoId: string;
  readonly candidates: readonly PhotoLocationCandidate[];
  readonly model: string | null;
  readonly generatedAt: string | null;
}

export const parsePhotoLocationCandidatesResponse = (
  value: unknown,
  path = "photoLocationCandidates",
): PhotoLocationCandidatesResponse => {
  const record = requireObject(value, path);
  return {
    photoId: requireString(record.photoId, `${path}.photoId`),
    candidates: requireArray(record.candidates, `${path}.candidates`).map((candidate, index) =>
      parsePhotoLocationCandidate(candidate, `${path}.candidates[${index}]`),
    ),
    model: requireNullable(record.model, `${path}.model`, requireString),
    generatedAt: requireNullable(record.generatedAt, `${path}.generatedAt`, requireString),
  };
};
