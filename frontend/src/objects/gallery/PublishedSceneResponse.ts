import { requireObject, requireString } from "../../apis/shared/decode";

/** 契约 §4.1 PublishedSceneResponse(code, runtimeVersion, generatedAt)：公开场景读取响应。 */
export interface PublishedSceneResponse {
  readonly code: string;
  readonly runtimeVersion: string;
  readonly generatedAt: string;
}

export const parsePublishedSceneResponse = (
  value: unknown,
  path = "publishedScene",
): PublishedSceneResponse => {
  const record = requireObject(value, path);
  return {
    code: requireString(record.code, `${path}.code`),
    runtimeVersion: requireString(record.runtimeVersion, `${path}.runtimeVersion`),
    generatedAt: requireString(record.generatedAt, `${path}.generatedAt`),
  };
};
