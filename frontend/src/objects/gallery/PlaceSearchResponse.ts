import { requireArray, requireNumber, requireObject, requireString } from "../../apis/shared/decode";

/** 契约 §2.1 PlaceCandidate：后端地点搜索代理返回的一条候选（WGS84）。 */
export interface PlaceCandidate {
  readonly name: string;
  readonly displayName: string;
  readonly latitude: number;
  readonly longitude: number;
}

/** 契约 §2.1 PlaceSearchResponse：`candidates: []` 表示搜索无结果，不是错误。 */
export interface PlaceSearchResponse {
  readonly candidates: readonly PlaceCandidate[];
}

const parsePlaceCandidate = (value: unknown, path: string): PlaceCandidate => {
  const record = requireObject(value, path);
  return {
    name: requireString(record.name, `${path}.name`),
    displayName: requireString(record.displayName, `${path}.displayName`),
    latitude: requireNumber(record.latitude, `${path}.latitude`),
    longitude: requireNumber(record.longitude, `${path}.longitude`),
  };
};

export const parsePlaceSearchResponse = (
  value: unknown,
  path = "placeSearch",
): PlaceSearchResponse => {
  const record = requireObject(value, path);
  return {
    candidates: requireArray(record.candidates, `${path}.candidates`).map((candidate, index) =>
      parsePlaceCandidate(candidate, `${path}.candidates[${index}]`),
    ),
  };
};
