import { describe, expect, it } from "vitest";
import type { ExhibitionSummary } from "../../../objects/gallery/ExhibitionSummary";
import { buildArchiveSummary } from "./buildArchiveSummary";

const cover = { kind: "auto" as const, imageUrl: "", width: 0, height: 0 };

const summary = (
  id: string,
  photoCount: number,
  publication: ExhibitionSummary["publication"],
): ExhibitionSummary => ({
  id,
  title: id,
  photoCount,
  updatedAt: "2026-10-28T08:00:00Z",
  cover,
  sceneStale: false,
  publication,
  hasUnpublishedChanges: false,
  pendingContributionCount: 0,
  scenePalette: [],
});

describe("buildArchiveSummary", () => {
  it("统计展览数、照片总数与已发布数", () => {
    const summaryValue = buildArchiveSummary([
      summary("a", 3, { version: 1, publishedAt: "2026-10-01T00:00:00Z" }),
      summary("b", 5, null),
      summary("c", 0, { version: 2, publishedAt: "2026-10-02T00:00:00Z" }),
    ]);
    expect(summaryValue).toEqual({
      exhibitionCount: 3,
      photoCount: 8,
      publishedCount: 2,
      pendingContributionCount: 0,
    });
  });

  it("空列表各项均为 0", () => {
    expect(buildArchiveSummary([])).toEqual({
      exhibitionCount: 0,
      photoCount: 0,
      publishedCount: 0,
      pendingContributionCount: 0,
    });
  });
});

describe("buildArchiveSummary 待处理回忆", () => {
  it("汇总各展览的待处理投稿数", () => {
    const withPending = (id: string, count: number) => ({
      ...summary(id, 1, null),
      pendingContributionCount: count,
    });
    expect(
      buildArchiveSummary([withPending("a", 2), withPending("b", 0), withPending("c", 3)])
        .pendingContributionCount,
    ).toBe(5);
  });
});
