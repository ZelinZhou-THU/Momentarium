import {
  requireBoolean,
  requireNullable,
  requireNumber,
  requireObject,
  requireString,
  requireStringArray,
} from "../../apis/shared/decode";
import { parseCoverView } from "./CoverView";
import type { CoverView } from "./CoverView";
import { parsePublicationSummary } from "./PublicationSummary";
import type { PublicationSummary } from "./PublicationSummary";

/** 契约 §2.1 ExhibitionSummary：列表页每行所需字段。 */
export interface ExhibitionSummary {
  readonly id: string;
  readonly title: string;
  readonly photoCount: number;
  readonly updatedAt: string;
  readonly cover: CoverView;
  readonly sceneStale: boolean;
  readonly publication: PublicationSummary | null;
  readonly hasUnpublishedChanges: boolean;
  /** v1.15：待创建者处理的投稿数（已提交且未采用，或已采用后有新版本）。 */
  readonly pendingContributionCount: number;
  /** 当前采用场景题面的主色（#RRGGBB），卡片配色的来源；没有当前场景时为空。 */
  readonly scenePalette: readonly string[];
}

export const parseExhibitionSummary = (
  value: unknown,
  path = "exhibition",
): ExhibitionSummary => {
  const record = requireObject(value, path);
  return {
    id: requireString(record.id, `${path}.id`),
    title: requireString(record.title, `${path}.title`),
    photoCount: requireNumber(record.photoCount, `${path}.photoCount`),
    updatedAt: requireString(record.updatedAt, `${path}.updatedAt`),
    cover: parseCoverView(record.cover, `${path}.cover`),
    sceneStale: requireBoolean(record.sceneStale, `${path}.sceneStale`),
    publication: requireNullable(
      record.publication,
      `${path}.publication`,
      parsePublicationSummary,
    ),
    hasUnpublishedChanges: requireBoolean(
      record.hasUnpublishedChanges,
      `${path}.hasUnpublishedChanges`,
    ),
    pendingContributionCount: requireNumber(
      record.pendingContributionCount,
      `${path}.pendingContributionCount`,
    ),
    scenePalette: requireStringArray(record.scenePalette, `${path}.scenePalette`),
  };
};
