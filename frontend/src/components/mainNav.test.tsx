import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MainNav } from "./MainNav";
import { UserMenu } from "./UserMenu";
import { TopBar } from "./ui";

const renderNavAt = (path: string): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <MainNav />
    </MemoryRouter>,
  );

describe("顶栏主导航", () => {
  it("并列两个空间：我的展览、我参与的，作者主页不在其中", () => {
    const html = renderNavAt("/exhibitions");
    expect(html).toContain('aria-label="主导航"');
    expect(html).toContain('href="/exhibitions"');
    expect(html).toContain("我的展览");
    expect(html).toContain('href="/contributions"');
    expect(html).toContain("我参与的");
    expect(html).not.toContain("作者主页");
    expect(html).not.toContain("我的回忆");
  });

  it("当前空间高亮；在某个展览的工作台里「我的展览」仍高亮", () => {
    const onExhibitions = renderNavAt("/exhibitions/abc?tab=map");
    expect(onExhibitions).toMatch(/aria-current="page"[^>]*>我的展览/);
    expect(onExhibitions).not.toMatch(/aria-current="page"[^>]*>我参与的/);

    const onContributions = renderNavAt("/contributions");
    expect(onContributions).toMatch(/aria-current="page"[^>]*>我参与的/);
    expect(onContributions).not.toMatch(/aria-current="page"[^>]*>我的展览/);
  });
});

describe("顶栏品牌与用户菜单", () => {
  it("品牌固定回「我的展览」（不按角色分流），主导航放在品牌旁", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TopBar nav={<span>NAV-SLOT</span>} />
      </MemoryRouter>,
    );
    expect(html).toContain('href="/exhibitions"');
    expect(html).toContain("Momentarium");
    expect(html).toContain("NAV-SLOT");
  });

  it("用户菜单默认收起：只显示用户名按钮，不渲染菜单条目", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <UserMenu username="memory_curator" onLogout={() => undefined} />
      </MemoryRouter>,
    );
    expect(html).toContain("memory_curator");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("账户设置");
    expect(html).not.toContain("我的作者主页");
  });
});
