import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { InviteCard } from "./InviteCard";

const activePreview = { exhibitionTitle: "雨中的济州", inviterName: "林间拾光", status: "active" as const };

describe("公开邀请页卡片（SSR）", () => {
  it("有效邀请 + 未登录：引导登录/注册并带 next 回到邀请页", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <InviteCard
          token="token-1"
          preview={activePreview}
          signedIn={false}
          joinState={{ status: "idle" }}
          onJoin={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("雨中的济州");
    expect(html).toContain("林间拾光 邀请你为这场展览写下一段回忆");
    expect(html).toContain("用于 AI 策展与三维场景生成");
    expect(html).toContain("邀请仍然有效");
    expect(html).toContain("登录后加入");
    expect(html).toContain("/login?next=%2Finvite%2Ftoken-1");
    expect(html).toContain("注册一个再加入");
  });

  it("有效邀请 + 已登录：显示加入按钮与投稿说明", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <InviteCard
          token="token-1"
          preview={activePreview}
          signedIn
          joinState={{ status: "idle" }}
          onJoin={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("加入这场展览");
    expect(html).toContain("加入后写下一段回忆，并附一张照片");
  });

  it("已关闭：不可加入，也不引导登录", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <InviteCard
          token="token-1"
          preview={{ exhibitionTitle: "雨中的济州", inviterName: "林间拾光", status: "closed" }}
          signedIn
          joinState={{ status: "idle" }}
          onJoin={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("邀请链接已关闭");
    expect(html).not.toContain("加入这场展览");
    expect(html).not.toContain("登录后加入");
  });

  it("加入成功：显示进入我参与的入口（带 exhibitionId/title）", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <InviteCard
          token="token-1"
          preview={activePreview}
          signedIn
          joinState={{
            status: "joined",
            membership: {
              exhibitionId: "ex-1",
              exhibitionTitle: "雨中的济州",
              status: "active",
              joinedAt: "2026-11-03T01:30:00Z",
            },
          }}
          onJoin={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("进入我参与的");
    expect(html).toContain("/contributions?exhibitionId=ex-1");
  });
});
