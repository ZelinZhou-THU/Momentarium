import { describe, expect, it } from "vitest";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import {
  WORKSPACE_TABS,
  describeContributionsTabBadge,
  describeMapTabBadge,
  describePublishTabBadge,
  describeSceneTabBadge,
  isImmersiveSceneView,
  withWorkspaceLocation,
} from "./workspaceTabs";

const baseDetail: ExhibitionDetail = {
  id: "ex-1",
  title: "济州岛的记忆",
  narrative: "",
  updatedAt: "2026-10-28T08:00:00Z",
  groups: [],
  ungroupedPhotos: [],
  sceneRun: null,
  currentSceneRun: null,  sceneStale: false,
  cover: { kind: "auto", imageUrl: "", width: 0, height: 0 },
  publication: null,
  hasUnpublishedChanges: false,
  pendingContributionCount: 0,
  scenePalette: [],
  locations: [],
};

const withRun = (
  status: "queued" | "generating" | "awaiting_capture" | "reviewing" | "succeeded" | "failed" | "cancelled",
  overrides: Partial<ExhibitionDetail> = {},
): ExhibitionDetail => ({
  ...baseDetail,
  ...overrides,
  sceneRun: {
    runId: "run-1",
    exhibitionId: "ex-1",
    status,
    source: status === "succeeded" ? "ai" : null,
    attempts: 0,
    kind: "generate",    parentRunId: null,    revisionInstruction: null,    isCurrent: false, dismissed: false,    hint: null,
    photoIds: [],
    curationVersion: 1,
    brief: null,
    code: null,
    review: null,
    errorCode: null,
    errorMessage: null,
    createdAt: "2026-10-28T09:00:00Z",
    updatedAt: "2026-10-28T09:00:00Z",
  },
});

describe("工作台 tab 定义与徽标", () => {
  it("六个 tab 顺序固定：照片/策展/投稿/地图/三维场景/发布（AI 灵感收进策展）", () => {
    expect(WORKSPACE_TABS.map((tab) => tab.id)).toEqual([
      "photos",
      "curation",
      "contributions",
      "map",
      "scene",
      "publish",
    ]);
  });

  it("地图徽标显示已有位置记录的照片数", () => {
    expect(describeMapTabBadge(baseDetail)).toEqual({ label: "0", dot: false });
    expect(
      describeMapTabBadge({
        ...baseDetail,
        locations: [
          {
            photoId: "photo-1",
            source: "manual",
            status: "confirmed",
            name: "济州岛",
            latitude: null,
            longitude: null,
            granularity: "hidden",
          },
        ],
      }),
    ).toEqual({ label: "1", dot: false });
  });

  it("场景徽标按运行状态映射，成功后待发布时提示圆点", () => {
    expect(describeSceneTabBadge(baseDetail)).toEqual({ label: "未生成", dot: false });
    expect(describeSceneTabBadge(withRun("queued"))).toEqual({ label: "生成中", dot: false });
    expect(describeSceneTabBadge(withRun("generating"))).toEqual({ label: "生成中", dot: false });
    expect(describeSceneTabBadge(withRun("awaiting_capture"))).toEqual({ label: "待截图", dot: true });
    expect(describeSceneTabBadge(withRun("reviewing"))).toEqual({ label: "评审中", dot: false });
    expect(describeSceneTabBadge(withRun("failed"))).toEqual({ label: "失败", dot: true });
    expect(describeSceneTabBadge(withRun("succeeded"))).toEqual({ label: "已通过", dot: true });
    expect(
      describeSceneTabBadge(
        withRun("succeeded", {
          publication: { version: 1, publishedAt: "2026-10-28T10:00:00Z" },
          hasUnpublishedChanges: false,
        }),
      ),
    ).toEqual({ label: "已通过", dot: false });
  });

  it("场景成功但素材已变化（如采用了投稿）：徽标显示「已过期」并带圆点，即使已发布", () => {
    expect(describeSceneTabBadge(withRun("succeeded", { sceneStale: true }))).toEqual({
      label: "已过期",
      dot: true,
    });
    expect(
      describeSceneTabBadge(
        withRun("succeeded", {
          sceneStale: true,
          publication: { version: 1, publishedAt: "2026-10-28T10:00:00Z" },
          hasUnpublishedChanges: false,
        }),
      ),
    ).toEqual({ label: "已过期", dot: true });
  });

  it("投稿徽标：没有待处理回忆不显示；有则显示数量并带圆点", () => {
    expect(describeContributionsTabBadge(baseDetail)).toBeNull();
    expect(describeContributionsTabBadge({ ...baseDetail, pendingContributionCount: 3 })).toEqual({
      label: "3",
      dot: true,
    });
  });

  it("发布徽标：未发布 / 有修改（圆点） / 已发布 vN", () => {
    expect(describePublishTabBadge(baseDetail)).toEqual({ label: "未发布", dot: false });
    expect(
      describePublishTabBadge({
        ...baseDetail,
        publication: { version: 2, publishedAt: "2026-10-28T10:00:00Z" },
        hasUnpublishedChanges: false,
      }),
    ).toEqual({ label: "已发布 v2", dot: false });
    expect(
      describePublishTabBadge({
        ...baseDetail,
        publication: { version: 2, publishedAt: "2026-10-28T10:00:00Z" },
        hasUnpublishedChanges: true,
      }),
    ).toEqual({ label: "有修改", dot: true });
  });
});

describe("工作台网址：分区与沉浸观看", () => {
  it("只有三维场景分区的 view=immersive 才算沉浸观看", () => {
    expect(isImmersiveSceneView("scene", "immersive")).toBe(true);
    expect(isImmersiveSceneView("publish", "immersive")).toBe(false);
    expect(isImmersiveSceneView("scene", null)).toBe(false);
  });

  it("写入分区时保留其它参数，离开场景分区会去掉 view", () => {
    const base = new URLSearchParams("tab=scene&view=immersive&ref=share");
    expect(withWorkspaceLocation(base, "publish", false).toString()).toBe("tab=publish&ref=share");
    expect(withWorkspaceLocation(new URLSearchParams("tab=scene"), "scene", true).toString()).toBe(
      "tab=scene&view=immersive",
    );
    expect(withWorkspaceLocation(base, "photos", true).has("view")).toBe(false);
  });
});
