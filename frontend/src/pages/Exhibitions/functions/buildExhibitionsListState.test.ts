import { describe, expect, it } from "vitest";
import type { ExhibitionSummary } from "../../../objects/gallery/ExhibitionSummary";
import { buildExhibitionsListState } from "./buildExhibitionsListState";

const summary: ExhibitionSummary = {
  id: "0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10",
  title: "济州的风",
  photoCount: 8,
  updatedAt: "2026-10-27T08:00:00Z",
  cover: {
    kind: "auto",
    imageUrl: "/api/exhibitions/0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10/cover",
    width: 1600,
    height: 1067,
  },
  sceneStale: true,
  publication: null,
  hasUnpublishedChanges: false,
  pendingContributionCount: 0,
  scenePalette: [],
};

describe("buildExhibitionsListState", () => {
  it("空列表建模为 empty，非空建模为 ready", () => {
    expect(buildExhibitionsListState([])).toEqual({ status: "empty" });
    expect(buildExhibitionsListState([summary])).toEqual({
      status: "ready",
      exhibitions: [summary],
    });
  });
});
