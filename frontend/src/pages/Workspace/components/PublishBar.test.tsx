import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import { PublishBar } from "./PublishBar";

// 渲染 smoke 不触发真实发布；mock 掉 API 类避免把 sessionStore/localStorage 拉进 node 测试环境。
vi.mock("../../../apis/gallery/PublishAPI", () => ({
  PublishAPI: class {
    send(): Promise<{ version: number; publishedAt: string }> {
      return Promise.resolve({ version: 1, publishedAt: "2026-10-27T10:00:00Z" });
    }
  },
}));

const photo = (id: string) => ({
  id,
  originalName: `${id}.jpg`,
  mime: "image/jpeg",
  width: 2048,
  height: 1365,
  caption: "",
  groupId: null,
  positionInGroup: null,
  contentUrl: `/api/photos/${id}/content?variant=full`,
  thumbUrl: `/api/photos/${id}/content?variant=thumb`,
  memories: [],
});

const sceneRunFixture = {
  runId: "run-1",
  exhibitionId: "0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10",
  status: "succeeded" as const,
  source: "ai" as const,
  attempts: 1,
  kind: "generate" as const,
  parentRunId: null,
  revisionInstruction: null,
  isCurrent: true, dismissed: false,
  hint: null,
  photoIds: ["p-1", "p-2", "p-3"],
  curationVersion: 3,
  brief: null,
  code: "function build(ctx) {}",
  review: null,
  errorCode: null,
  errorMessage: null,
  createdAt: "2026-10-27T09:00:00Z",
  updatedAt: "2026-10-27T09:00:00Z",
};

const readyDetail: ExhibitionDetail = {
  id: "0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10",
  title: "济州岛的记忆",
  narrative: "",
  updatedAt: "2026-10-27T08:00:00Z",
  groups: [
    { id: "g-1", title: "抵达", narrative: "", position: 0, photos: [photo("p-1"), photo("p-2"), photo("p-3")] },
  ],
  ungroupedPhotos: [],
  sceneRun: sceneRunFixture,
  currentSceneRun: sceneRunFixture,
  sceneStale: false,
  cover: {
    kind: "auto",
    imageUrl: "/api/exhibitions/0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10/cover",
    width: 2048,
    height: 1365,
  },
  publication: null,
  hasUnpublishedChanges: false,
  pendingContributionCount: 0,
  scenePalette: [],
  locations: [],
};

const render = (detail: ExhibitionDetail): string =>
  renderToStaticMarkup(<PublishBar detail={detail} onChanged={() => undefined} />);

describe("PublishBar 渲染", () => {
  it("未就绪：展示发布前原因，发布按钮禁用", () => {
    const html = render({
      ...readyDetail,
      groups: [{ ...readyDetail.groups[0]!, photos: [photo("p-1")] }],
      sceneRun: null,
      currentSceneRun: null,
      sceneStale: true,
    });

    expect(html).toContain("发布前还需要");
    expect(html).toContain("合集至少需要 3 张照片".replace("合集", "展览"));
    expect(html).toContain("发布展览");
    expect(html).not.toContain("下线");
  });

  it("首次发布就绪：发布按钮可用、无阻断原因", () => {
    const html = render(readyDetail);

    expect(html).not.toContain("发布前还需要");
    expect(html).toContain("发布展览");
    // 没有被禁用的按钮：发布按钮可用，也不再摆未实现的占位按钮。
    expect((html.match(/disabled=""/g) ?? []).length).toBe(0);
    expect(html).not.toContain("请先满足上方发布条件");
  });

  it("已发布且无未发布修改：显示版本/公开链接，按钮禁用", () => {
    const html = render({
      ...readyDetail,
      publication: { version: 2, publishedAt: "2026-10-27T10:00:00Z" },
      hasUnpublishedChanges: false,
    });

    expect(html).toContain("已发布 v2");
    expect(html).toContain('href="/show/0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10"');
    expect(html).toContain("公开页与草稿一致");
    expect(html).toContain("更新发布");
    expect(html).toContain('disabled=""');
  });

  it("已发布但有未发布修改：提示更新发布", () => {
    const html = render({
      ...readyDetail,
      publication: { version: 2, publishedAt: "2026-10-27T10:00:00Z" },
      hasUnpublishedChanges: true,
    });

    expect(html).toContain("草稿有未发布修改");
    expect(html).toContain("更新发布");
  });
});
