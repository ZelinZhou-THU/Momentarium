import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ContributionSummary } from "../../../../../objects/gallery/Contribution";
import type { ContributionManagementResponse } from "../../../../../objects/gallery/ContributionManagement";
import { AdoptContributionDialog } from "./AdoptContributionDialog";
import { ContributionReviewList } from "./ContributionReviewList";
import { InviteLinksSection } from "./InviteLinksSection";

vi.mock("../../../../../stores/sessionStore", () => ({
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
  memoryText: "那天的海风很大，我们把伞收起来走了很久。",
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

const photoFile = {
  mime: "image/jpeg",
  width: 2048,
  height: 1365,
  contentUrl: "/api/contributions/c-1/content?variant=full",
  thumbUrl: "/api/contributions/c-1/content?variant=thumb",
};

const groups = [
  { id: "g-1", title: "第一章 退潮" },
  { id: "g-2", title: "" },
];

const adopted = { contributionId: "c-1", photoId: "p-1", memoryId: "m-1", adoptedVersion: 1 };

const management: ContributionManagementResponse = {
  invites: [
    { id: "inv-1", status: "active", createdAt: "2026-11-03T01:20:00Z", closedAt: null },
  ],
  participants: [
    {
      contributorId: "u-1",
      username: "island_walker",
      displayName: "海风",
      status: "active",
      joinedAt: "2026-11-03T01:30:00Z",
      contributionCount: 2,
    },
  ],
};

describe("工作台投稿分区渲染（SSR，回忆优先）", () => {
  it("邀请与参与者保持原管理入口", () => {
    const html = renderToStaticMarkup(
      <InviteLinksSection
        invites={management.invites}
        participants={management.participants}
        createdInvite={null}
        creating={false}
        closingInviteId={null}
        revokingContributorId={null}
        onCreate={vi.fn()}
        onClose={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );
    expect(html).toContain("邀请与参与者");
    expect(html).toContain("创建邀请链接");
    expect(html).toContain("撤销参与");
  });

  it("审阅：历史纯文字无采用按钮；有照片才可「采用」", () => {
    const html = renderToStaticMarkup(
      <ContributionReviewList
        reviewContributions={[
          contribution({ suggestedCaption: "海风很大的一天" }),
          contribution({ id: "c-photo", file: photoFile }),
        ]}
        declinedContributions={[contribution({ id: "c-declined", status: "declined" })]}
        withdrawnContributions={[contribution({ id: "c-withdrawn", status: "withdrawn" })]}
        otherContributions={[]}
        adoptedMemories={[
          {
            photoId: "p-1",
            photoLabel: "退潮的礁石",
            caption: "退潮的礁石",
            location: null,
            thumbUrl: "/api/photos/p-1/content?variant=thumb",
            contentUrl: "/api/photos/p-1/content",
            memoryId: "m-1",
            text: "海风很大。",
            contributorName: "海风",
          },
        ]}
        removingMemoryId={null}
        keptVersionIds={[]}
        decliningId={null}
        onAdopt={vi.fn()}
        onDecline={vi.fn()}
        onKeepVersion={vi.fn()}
        onRemoveMemory={vi.fn()}
      />,
    );
    expect(html).toContain("待审回忆");
    expect(html).toContain("历史纯文字回忆");
    expect(html).toContain("建议图注：海风很大的一天");
    expect(html).toContain("历史纯文字回忆没有照片，不能采用");
    expect(html).toContain("采用这段回忆");
    expect(html).toContain("不采用");
    expect(html).toContain("未被采用");
    expect(html).toContain("已撤回");
    expect(html).toContain("退潮的礁石");
    expect(html).toContain("放大查看：");
    expect(html).not.toContain("image/jpeg");
    expect(html).toContain("移除讲述");
    expect(html).toContain("会一并从草稿移除或归档");
    expect(html).toContain("已发布版本不会改变");
    expect(html).not.toContain("把回忆挂到已有照片");
  });

  it("待确认更新显示「更新到最新版 / 保持当前版本」，已采用不能拒绝", () => {
    const html = renderToStaticMarkup(
      <ContributionReviewList
        reviewContributions={[
          contribution({ adoption: adopted, hasPendingUpdate: true, file: photoFile }),
        ]}
        declinedContributions={[]}
        withdrawnContributions={[]}
        otherContributions={[]}
        adoptedMemories={[]}
        removingMemoryId={null}
        keptVersionIds={[]}
        decliningId={null}
        onAdopt={vi.fn()}
        onDecline={vi.fn()}
        onKeepVersion={vi.fn()}
        onRemoveMemory={vi.fn()}
      />,
    );
    expect(html).toContain("更新到最新版");
    expect(html).toContain("保持当前版本");
    expect(html).toContain("已采用，不能标记为不采用");
  });

  it("待确认更新：并排显示已采用版本与投稿者最新版本，写出文字是否有变化", () => {
    const html = renderToStaticMarkup(
      <ContributionReviewList
        reviewContributions={[
          contribution({
            version: 2,
            memoryText: "第二版：伞收起来，走了很久。",
            file: photoFile,
            adoption: adopted,
            hasPendingUpdate: true,
          }),
        ]}
        declinedContributions={[]}
        withdrawnContributions={[]}
        otherContributions={[]}
        adoptedMemories={[
          {
            photoId: "p-1",
            photoLabel: "退潮的礁石",
            caption: "退潮的礁石",
            location: null,
            thumbUrl: "/api/photos/p-1/content?variant=thumb",
            contentUrl: "/api/photos/p-1/content?variant=full",
            memoryId: "m-1",
            text: "第一版：海风很大。",
            contributorName: "海风",
          },
        ]}
        removingMemoryId={null}
        keptVersionIds={[]}
        decliningId={null}
        onAdopt={vi.fn()}
        onDecline={vi.fn()}
        onKeepVersion={vi.fn()}
        onRemoveMemory={vi.fn()}
      />,
    );
    expect(html).toContain("当前已采用 · 第 1 版");
    expect(html).toContain("投稿者最新 · 第 2 版");
    expect(html).toContain("第一版：海风很大。");
    expect(html).toContain("第二版：伞收起来，走了很久。");
    expect(html).toContain("讲述文字有修改");
    expect(html).toContain("当前草稿图注：退潮的礁石");
    expect(html).toContain("投稿者建议地点：济州岛 · 涯月邑");
    expect(html).toContain("并非历史差异");
  });

  it("没有未被采用 / 已撤回 / 其他回忆时，这三块不占版面", () => {
    const html = renderToStaticMarkup(
      <ContributionReviewList
        reviewContributions={[]}
        declinedContributions={[]}
        withdrawnContributions={[]}
        otherContributions={[]}
        adoptedMemories={[]}
        removingMemoryId={null}
        keptVersionIds={[]}
        decliningId={null}
        onAdopt={vi.fn()}
        onDecline={vi.fn()}
        onKeepVersion={vi.fn()}
        onRemoveMemory={vi.fn()}
      />,
    );
    expect(html).toContain("待审回忆");
    expect(html).toContain("已采用的讲述");
    expect(html).not.toContain("未被采用");
    expect(html).not.toContain("已撤回");
    expect(html).not.toContain("其他回忆");
  });

  it("采用对话框只剩「收进草稿」：照片+图注+位置+公开粒度，无目标选择", () => {
    const html = renderToStaticMarkup(
      <AdoptContributionDialog
        contribution={contribution({ file: photoFile, suggestedCaption: "雨停之后的海面" })}
        groups={groups}
        submitting={false}
        error={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(html).toContain("收进草稿");
    expect(html).toContain("雨停之后的海面");
    expect(html).toContain("投稿者建议的图注");
    expect(html).toContain("图注（可清空，不强制）");
    expect(html).toContain("地点名称");
    expect(html).toContain("公开粒度");
    // 采用会新增照片、让场景过期，要提前告知。
    expect(html).toContain("变为「已过期」");
    // v1.15 可选择放进哪一章：默认最后一章，空标题按序号称呼，也可以暂不放入。
    expect(html).toContain("放进哪个章节");
    expect(html).toContain("第一章 退潮");
    expect(html).toContain("章节 2");
    expect(html).toContain("暂不放入章节");
    expect(html).toMatch(/<option value="g-2" selected/u);
    expect(html).not.toContain("新建草稿照片");
    expect(html).not.toContain("只收下回忆");
    expect(html).not.toContain("选择已有照片");
  });

  it("待确认更新仍原地更新，不显示目标选择", () => {
    const updating = renderToStaticMarkup(
      <AdoptContributionDialog
        contribution={contribution({ file: photoFile, adoption: adopted, hasPendingUpdate: true })}
        current={{ version: 1, text: "旧讲述", photoLabel: "旧照片", caption: "策展人图注", thumbUrl: "/t", contentUrl: "/f", location: { photoId: "p-1", name: "原地点", latitude: 30, longitude: 120, granularity: "exact", source: "manual", status: "confirmed" } }}
        groups={groups}
        submitting={false}
        error={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(updating).toContain("更新到最新版");
    expect(updating).toContain("原地更新");
    expect(updating).toContain('value="策展人图注"');
    expect(updating).toContain('value="原地点"');
    expect(updating).toContain('value="30"');
    expect(updating).toContain("投稿者建议：济州岛 · 涯月邑");
    expect(updating).toMatch(/checked=""[^>]*\/><span>公开精确点/u);
    // 原地更新不新增照片，但讲述文字有变化时场景同样会过期（讲述是 AI 输入）。
    expect(updating).toContain("讲述文字有变化");
    expect(updating).not.toContain("新增一张照片");
    expect(updating).not.toContain("放进哪个章节");
    expect(updating).not.toContain("选择已有照片");
  });
});
