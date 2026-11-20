import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ExhibitionSummary } from "../../../objects/gallery/ExhibitionSummary";
import { buildArchiveSummary } from "../functions/buildArchiveSummary";
import { ArchiveCollection } from "./ArchiveCollection";
import { ArchiveMasthead } from "./ArchiveMasthead";

// 封面经 useAuthorizedImage 取图，会读会话令牌；SSR 测试不需要真会话。
vi.mock("../../../stores/sessionStore", () => ({
  getSessionToken: (): string | null => null,
  clearSession: (): void => undefined,
}));

const exhibition = (id: string, pendingContributionCount: number): ExhibitionSummary => ({
  id,
  title: `展览 ${id}`,
  photoCount: 3,
  updatedAt: "2026-11-04T01:00:00Z",
  cover: { kind: "auto", imageUrl: `/api/exhibitions/${id}/cover`, width: 1600, height: 900 },
  sceneStale: false,
  publication: null,
  hasUnpublishedChanges: false,
  pendingContributionCount,
  scenePalette: [],
});

const renderCollection = (exhibitions: readonly ExhibitionSummary[]): string =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ArchiveCollection
        exhibitions={exhibitions}
        onOpen={vi.fn()}
        onView={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    </MemoryRouter>,
  ).replaceAll("<!-- -->", "");

describe("我的展览：待处理回忆提示", () => {
  it("有待处理投稿的展览卡片直达「投稿」分区，没有的不显示", () => {
    const html = renderCollection([exhibition("a", 2), exhibition("b", 0)]);
    expect(html).toContain("2 段回忆待处理");
    expect(html).toContain('href="/exhibitions/a?tab=contributions"');
    expect(html).not.toContain('href="/exhibitions/b?tab=contributions"');
  });

  it("统计条只在有待处理回忆时多出一项", () => {
    const render = (list: readonly ExhibitionSummary[]): string =>
      renderToStaticMarkup(
        <ArchiveMasthead summary={buildArchiveSummary(list)} onCreate={vi.fn()} />,
      );
    expect(render([exhibition("a", 0)])).not.toContain("待处理回忆");
    expect(render([exhibition("a", 2), exhibition("b", 1)])).toContain("待处理回忆");
  });
});
