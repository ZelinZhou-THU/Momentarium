import { requireNumber, requireObject, requireString } from "../../apis/shared/decode";

/** 契约 §2.1 PublicationSummary(version, publishedAt)：当前 active 快照摘要。 */
export interface PublicationSummary {
  readonly version: number;
  readonly publishedAt: string;
}

export const parsePublicationSummary = (
  value: unknown,
  path = "publication",
): PublicationSummary => {
  const record = requireObject(value, path);
  return {
    version: requireNumber(record.version, `${path}.version`),
    publishedAt: requireString(record.publishedAt, `${path}.publishedAt`),
  };
};
