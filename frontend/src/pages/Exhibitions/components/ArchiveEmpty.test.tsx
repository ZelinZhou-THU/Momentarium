import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ArchiveEmpty } from "./ArchiveEmpty";

const render = (participatedExhibitionCount?: number): string =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ArchiveEmpty onCreate={vi.fn()} participatedExhibitionCount={participatedExhibitionCount} />
    </MemoryRouter>,
  );

describe("空馆（我的展览为空）", () => {
  it("没有参与记录时只引导新建展览", () => {
    const html = render(0);
    expect(html).toContain("新建第一个展览");
    expect(html).not.toContain("我参与的");
  });

  it("有参与记录时指向「我参与的」并给出展览数", () => {
    const html = render(2);
    expect(html).toContain("你已参与 2 场别人的展览");
    expect(html).toContain('href="/contributions"');
  });
});
