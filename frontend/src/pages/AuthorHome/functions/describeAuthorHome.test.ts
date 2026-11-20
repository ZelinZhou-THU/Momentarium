import { describe, expect, it } from "vitest";
import type { AuthorPageView } from "../../../objects/gallery/AuthorPageView";
import { describeAuthorHome, formatPublishedDate } from "./describeAuthorHome";

const page: AuthorPageView = {
  username: "memory_curator",
  displayName: "林间拾光",
  bio: "",
  exhibitions: [],
  journeyLocations: [],
};

describe("describeAuthorHome", () => {
  it("显示名与用户名不同时带 @handle；没有展览时给出空态文案", () => {
    expect(describeAuthorHome(page)).toEqual({
      displayName: "林间拾光",
      handle: "@memory_curator",
      countLabel: "还没有公开的展览",
    });
  });

  it("显示名等于用户名时不重复显示 handle；有展览时显示数量", () => {
    const card = {
      id: "e1",
      title: "雾港",
      narration: "",
      cover: { kind: "auto" as const, imageUrl: "/api/exhibitions/e1/cover", width: 1600, height: 900 },
      version: 1,
      publishedAt: "2026-10-31T08:00:00Z",
      scenePalette: [],
    };
    const view = describeAuthorHome({ ...page, displayName: "memory_curator", exhibitions: [card, { ...card, id: "e2" }] });
    expect(view.handle).toBeNull();
    expect(view.countLabel).toBe("2 个公开展览");
  });
});

describe("formatPublishedDate", () => {
  it("包含年月日", () => {
    expect(formatPublishedDate("2026-10-31T08:00:00Z")).toMatch(/2026年10月/);
  });
});
