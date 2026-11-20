import { parsePublicationSummary } from "./PublicationSummary";
import type { PublicationSummary } from "./PublicationSummary";

/**
 * 契约 §2.1 PublishExhibitionResponse(version, publishedAt)：publish 的响应。
 * 与 PublicationSummary 同形，复用其解码器避免重复。
 */
export type PublishExhibitionResponse = PublicationSummary;

export const parsePublishExhibitionResponse = (
  value: unknown,
  path = "publishExhibition",
): PublishExhibitionResponse => parsePublicationSummary(value, path);
