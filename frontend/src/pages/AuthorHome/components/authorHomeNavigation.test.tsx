import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthorHomeNav } from "./AuthorHomeNav";
import { AuthorHomeUnavailable } from "./AuthorHomeUnavailable";

const renderNav = (signedIn: boolean): string =>
  renderToStaticMarkup(
    <MemoryRouter>
      <AuthorHomeNav signedIn={signedIn} />
    </MemoryRouter>,
  );

const renderUnavailable = (username: string, currentUsername: string | null): string =>
  renderToStaticMarkup(
    <MemoryRouter>
      <AuthorHomeUnavailable username={username} currentUsername={currentUsername} />
    </MemoryRouter>,
  );

describe("作者主页轻量导航", () => {
  it("标明当前作者主页，匿名品牌不跳转到需要登录的页面", () => {
    const html = renderNav(false);
    expect(html).toContain("Momentarium");
    expect(html).not.toContain('href="/"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="作者主页导航"');
  });

  it("登录用户右侧是「我的展览」与「我参与的」，未登录是「登录」", () => {
    const signedIn = renderNav(true);
    expect(signedIn).toContain("我参与的");
    expect(signedIn).toContain('href="/contributions"');
    expect(signedIn).toContain("我的展览");
    expect(signedIn).toContain('href="/exhibitions"');
    expect(signedIn).not.toContain('href="/login"');

    const anonymous = renderNav(false);
    expect(anonymous).toContain("登录");
    expect(anonymous).toContain('href="/login"');
    expect(anonymous).not.toContain('href="/exhibitions"');
    expect(anonymous).not.toContain('href="/contributions"');
  });
});

describe("作者主页未公开提示", () => {
  it("普通访客保持原文案，不显示账户设置入口", () => {
    const html = renderUnavailable("memory_curator", null);
    expect(html).toContain("这个主页还没有公开");
    expect(html).toContain("作者可能没有开启主页，或者链接有误");
    expect(html).not.toContain("/account");
    expect(html).not.toContain("去账户设置");
  });

  it("本人访问自己的未公开主页时给出「去账户设置开启公开主页」链接", () => {
    const html = renderUnavailable("memory_curator", "memory_curator");
    expect(html).toContain("去账户设置开启公开主页 →");
    expect(html).toContain('href="/account"');
  });

  it("登录了其他账号的访客看不到账户设置入口", () => {
    const html = renderUnavailable("memory_curator", "someone_else");
    expect(html).not.toContain("/account");
    expect(html).not.toContain("去账户设置");
  });
});
