import type { ExhibitionSummary } from "../../../objects/gallery/ExhibitionSummary";

export interface ArchiveSummary {
  readonly exhibitionCount: number;
  readonly photoCount: number;
  readonly publishedCount: number;
  /** 所有展览里待创建者处理的投稿总数。 */
  readonly pendingContributionCount: number;
}

/** 主页统计条（纯函数）：展览数 / 照片总数 / 已发布数 / 待处理回忆数，只依赖列表数据。 */
export const buildArchiveSummary = (
  exhibitions: readonly ExhibitionSummary[],
): ArchiveSummary => ({
  exhibitionCount: exhibitions.length,
  photoCount: exhibitions.reduce((sum, exhibition) => sum + exhibition.photoCount, 0),
  publishedCount: exhibitions.filter((exhibition) => exhibition.publication !== null).length,
  pendingContributionCount: exhibitions.reduce(
    (sum, exhibition) => sum + exhibition.pendingContributionCount,
    0,
  ),
});
