import { requireNumber, requireOneOf, requireObject, requireString } from "../../apis/shared/decode";

/** 契约 §2.1 封面类型：auto=第一章第一张、photo=选定照片、render=场景渲染图。 */
export type CoverKind = "auto" | "photo" | "render";

const COVER_KINDS: readonly CoverKind[] = ["auto", "photo", "render"];

export interface CoverView {
  readonly kind: CoverKind;
  readonly imageUrl: string;
  readonly width: number;
  readonly height: number;
}

export const parseCoverView = (value: unknown, path = "cover"): CoverView => {
  const record = requireObject(value, path);
  return {
    kind: requireOneOf(record.kind, COVER_KINDS, `${path}.kind`),
    imageUrl: requireString(record.imageUrl, `${path}.imageUrl`),
    width: requireNumber(record.width, `${path}.width`),
    height: requireNumber(record.height, `${path}.height`),
  };
};
