import { requireObject } from "../apis/shared/decode";

/** 契约 §1.1 EmptyResponse {}（logout 等无响应体的成功结果）。 */
export type EmptyResponse = Record<string, never>;

export const parseEmptyResponse = (value: unknown): EmptyResponse => {
  requireObject(value, "emptyResponse");
  return {};
};
