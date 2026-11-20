import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ContributionSummary } from "../../../objects/gallery/Contribution";
import { ContributionCard } from "./ContributionCard";
import { ContributionEditor } from "./ContributionEditor";

vi.mock("../../../stores/sessionStore", () => ({
  getSessionToken: (): string | null => null,
  clearSession: (): void => undefined,
}));

const contribution = (overrides: Partial<ContributionSummary> = {}): ContributionSummary => ({
  id: "c-1",
  exhibitionId: "ex-1",
  exhibitionTitle: "雨中的济州",
  contributor: { contributorId: "u-1", username: "island_walker", displayName: "海风" },
  status: "submitted",
  version: 2,
  memoryText: "那天的海风很大。",
  suggestedCaption: null,
  location: { name: "济州岛 · 涯月邑", latitude: 33.4632, longitude: 126.3175, source: "manual" },
  file: null,
  adoption: null,
  hasPendingUpdate: false,
  exhibitionPublished: false,
  memoryPublished: false,
  createdAt: "2026-11-03T02:00:00Z",
  updatedAt: "2026-11-03T02:05:00Z",
  withdrawnAt: null,
  ...overrides,
});

describe("我参与的渲染（SSR）", () => {
  it("纯文字回忆：无缩略图、引用块、建议图注与「纯文字回忆」标识", () => {
    const html = renderToStaticMarkup(
      <ContributionCard
        contribution={contribution({ suggestedCaption: "海风很大的一天" })}
        onEdit={vi.fn()}
        onWithdrawn={vi.fn()}
      />,
    );
    expect(html).toContain("历史纯文字回忆");
    expect(html).toContain("那天的海风很大");
    expect(html).toContain("建议图注：海风很大的一天");
    expect(html).toContain("补一张照片后才能重新提交");
    expect(html).toContain("待策展人查看");
    expect(html).toContain("修改内容");
    expect(html).not.toContain("<img");
  });

  it("已采用且修改待确认：显示版本与待确认提示", () => {
    const html = renderToStaticMarkup(
      <ContributionCard
        contribution={contribution({
          adoption: { contributionId: "c-1", photoId: "p-1", memoryId: "m-1", adoptedVersion: 1 },
          hasPendingUpdate: true,
        })}
        onEdit={vi.fn()}
        onWithdrawn={vi.fn()}
      />,
    );
    expect(html).toContain("已采用第 1 版");
    expect(html).toContain("修改待确认");
    expect(html).toContain("等待策展人确认");
    expect(html).toContain("展览还没有发布");
    expect(html).not.toContain("查看公开展览");
  });

  it("展览已发布：给公开展览链接；讲述已公开时说明已随展览公开", () => {
    const html = renderToStaticMarkup(
      <ContributionCard
        contribution={contribution({
          adoption: { contributionId: "c-1", photoId: "p-1", memoryId: "m-1", adoptedVersion: 2 },
          exhibitionPublished: true,
          memoryPublished: true,
        })}
        onEdit={vi.fn()}
        onWithdrawn={vi.fn()}
      />,
    );
    expect(html).toContain("已随展览公开");
    expect(html).toContain("/show/ex-1");
    expect(html).toContain("查看公开展览《雨中的济州》");
  });

  it("未被采用可修改后重新提交；已撤回只读", () => {
    const declined = renderToStaticMarkup(
      <ContributionCard
        contribution={contribution({ status: "declined" })}
        onEdit={vi.fn()}
        onWithdrawn={vi.fn()}
      />,
    );
    expect(declined).toContain("未被采用");
    expect(declined).toContain("修改并重新提交");
    expect(declined).toContain("撤回这段回忆");

    const withdrawn = renderToStaticMarkup(
      <ContributionCard
        contribution={contribution({ status: "withdrawn", withdrawnAt: "2026-11-03T03:00:00Z" })}
        onEdit={vi.fn()}
        onWithdrawn={vi.fn()}
      />,
    );
    expect(withdrawn).toContain("已撤回");
    expect(withdrawn).not.toContain("修改内容");
  });

  it("编辑器：回忆+必填照片，保存草稿/提交两个动作", () => {
    const html = renderToStaticMarkup(
      <ContributionEditor
        target={{ kind: "create", exhibitionId: "ex-1", exhibitionTitle: "雨中的济州" }}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onRevoked={vi.fn()}
        onPhotoError={vi.fn()}
      />,
    );
    expect(html).toContain("写一段回忆");
    expect(html).toContain("保存草稿");
    expect(html).toContain("提交给策展人");
    expect(html).toContain("建议图注（可选）");
    expect(html).toContain("照片（必填，最多 1 张）");
    expect(html).toContain("提交前必须有一张");
    expect(html).toContain("地点（可选）");
    expect(html).toContain("用于 AI 策展与三维场景生成");
    expect(html).toContain("搜索地点名称");
    expect(html).toContain("在地图上选点");
    expect(html).toContain("OpenStreetMap");
  });

  it("编辑器：已有地点时预填名称与坐标，可清除", () => {
    const html = renderToStaticMarkup(
      <ContributionEditor
        target={{ kind: "edit", contribution: contribution({ status: "draft" }) }}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onRevoked={vi.fn()}
        onPhotoError={vi.fn()}
      />,
    );
    expect(html).toContain("济州岛 · 涯月邑");
    expect(html).toContain("33.4632");
    expect(html).toContain("清除地点");
  });

  it("编辑器：修改被拒回忆可重新提交", () => {
    const html = renderToStaticMarkup(
      <ContributionEditor
        target={{ kind: "edit", contribution: contribution({ status: "declined" }) }}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onRevoked={vi.fn()}
        onPhotoError={vi.fn()}
      />,
    );
    expect(html).toContain("修改这段回忆");
    expect(html).toContain("重新提交");
  });
});

describe("粘贴邀请链接入口（SSR）", () => {
  it("显示输入框、说明与「打开邀请」按钮；空内容时按钮禁用", async () => {
    const { MemoryRouter } = await import("react-router-dom");
    const { JoinByInviteForm } = await import("./JoinByInviteForm");
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <JoinByInviteForm />
      </MemoryRouter>,
    );
    expect(html).toContain("粘贴邀请链接或邀请码");
    expect(html).toContain("打开邀请");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>打开邀请/u);
  });
});
