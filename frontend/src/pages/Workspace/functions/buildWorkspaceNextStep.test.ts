import { describe, expect, it } from "vitest";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { PhotoView } from "../../../objects/gallery/PhotoView";
import type { SceneRunView } from "../../../objects/gallery/SceneRunView";
import { buildWorkspaceNextStep } from "./buildWorkspaceNextStep";
import { parseWorkspaceTab } from "./workspaceTabs";

const photo = (id: string): PhotoView => ({
  id,
  originalName: `${id}.jpg`,
  mime: "image/jpeg",
  width: 800,
  height: 600,
  caption: "",
  groupId: null,
  positionInGroup: null,
  contentUrl: `/api/photos/${id}/content`,
  thumbUrl: `/api/photos/${id}/thumb`,
  memories: [],
});

const threePhotos = [photo("p1"), photo("p2"), photo("p3")];

const emptyDetail: ExhibitionDetail = {
  id: "ex-1",
  title: "济州岛的记忆",
  narrative: "",
  updatedAt: "2026-10-28T08:00:00Z",
  groups: [],
  ungroupedPhotos: [],
  sceneRun: null,
  currentSceneRun: null,  sceneStale: true,
  cover: { kind: "auto", imageUrl: "", width: 0, height: 0 },
  publication: null,
  hasUnpublishedChanges: false,
  pendingContributionCount: 0,
  scenePalette: [],
  locations: [],
};

const curated: ExhibitionDetail = {
  ...emptyDetail,
  groups: [{ id: "g1", title: "海边", narrative: "", position: 0, photos: threePhotos }],
};

const run = (status: SceneRunView["status"]): SceneRunView => ({
  runId: "run-1",
  exhibitionId: "ex-1",
  status,
  source: status === "succeeded" ? "ai" : null,
  attempts: 0,
  kind: "generate",  parentRunId: null,  revisionInstruction: null,  isCurrent: false, dismissed: false,  hint: null,
  photoIds: ["p1", "p2", "p3"],
  curationVersion: 1,
  brief: null,
  code: null,
  review: null,
  errorCode: null,
  errorMessage: null,
  createdAt: "2026-10-28T09:00:00Z",
  updatedAt: "2026-10-28T09:00:00Z",
});

const withRuns = (
  latest: SceneRunView | null,
  current: SceneRunView | null,
  stale = false,
): ExhibitionDetail => ({
  ...curated,
  sceneRun: latest,
  currentSceneRun: current,
  sceneStale: stale,
});

const succeededRun = run("succeeded");

const publishedDetail = (
  current: SceneRunView | null,
  latest: SceneRunView | null,
  hasUnpublishedChanges: boolean,
): ExhibitionDetail => ({
  ...withRuns(latest, current),
  publication: { version: 2, publishedAt: "2026-10-28T10:00:00Z" },
  hasUnpublishedChanges,
});

describe("工作台下一步", () => {
  it("未保存的策展修改优先于一切", () => {
    expect(buildWorkspaceNextStep(withRuns(succeededRun, succeededRun), true).tab).toBe("curation");
  });

  it("照片不足 3 张 → 照片分区，并给出当前张数", () => {
    const next = buildWorkspaceNextStep({ ...emptyDetail, ungroupedPhotos: [photo("p1")] }, false);
    expect(next.tab).toBe("photos");
    expect(next.message).toContain("目前 1 张");
  });

  it("照片够了但还没有章节 → 策展，并打开 AI 灵感面板", () => {
    expect(buildWorkspaceNextStep({ ...emptyDetail, ungroupedPhotos: threePhotos }, false)).toMatchObject({
      tab: "curation",
      openInspiration: true,
    });
    expect(buildWorkspaceNextStep(curated, false).openInspiration).toBe(false);
  });

  it("有未分组照片或空章节 → 策展", () => {
    const ungrouped = { ...curated, ungroupedPhotos: [photo("p4")] };
    const emptyGroup = {
      ...curated,
      groups: [...curated.groups, { id: "g2", title: "空", narrative: "", position: 1, photos: [] }],
    };
    expect(buildWorkspaceNextStep(ungrouped, false).tab).toBe("curation");
    expect(buildWorkspaceNextStep(emptyGroup, false).tab).toBe("curation");
  });

  it("场景进度用最新运行；没有 current 时发布判断仍未就绪", () => {
    expect(buildWorkspaceNextStep(curated, false)).toMatchObject({ tab: "scene", title: "生成三维场景" });
    expect(buildWorkspaceNextStep(withRuns(run("generating"), null), false).title).toBe("场景生成中");
    expect(buildWorkspaceNextStep(withRuns(run("awaiting_capture"), null), false).title).toBe("场景待渲染截图");
    // 最新 fail 但从未采用过当前场景：不拿最新运行当“重新生成”的当前依据。
    expect(buildWorkspaceNextStep(withRuns(run("failed"), null), false).title).toBe("生成三维场景");
    expect(buildWorkspaceNextStep(withRuns(run("failed"), null), false).message).toContain(
      "还没有当前采用",
    );
  });

  it("最新修订候选未采用：发布/下一步仍按旧 current，不误报场景已更新", () => {
    const candidate: SceneRunView = {
      ...succeededRun,
      runId: "run-candidate",
      kind: "revise",
      parentRunId: succeededRun.runId,
      isCurrent: false, dismissed: false,
    };
    // 旧 current 已就绪且无发布：下一步是发布，不是“场景已更新”。
    expect(buildWorkspaceNextStep(withRuns(candidate, succeededRun), false)).toMatchObject({
      tab: "publish",
      title: "发布展览",
    });
    // 已发布且服务端 hasUnpublishedChanges=false（候选未采用）：保持 done。
    expect(buildWorkspaceNextStep(publishedDetail(succeededRun, candidate, false), false)).toMatchObject({
      title: "已发布 v2",
      done: true,
    });
  });

  it("当前场景 stale → 重新生成；采用修订后的新 current → 更新发布", () => {
    expect(buildWorkspaceNextStep(withRuns(succeededRun, succeededRun, true), false)).toMatchObject({
      tab: "scene",
      title: "重新生成场景",
    });
    expect(
      buildWorkspaceNextStep(withRuns(succeededRun, succeededRun, true), false).message,
    ).toContain("过期");

    const acceptedCurrent: SceneRunView = {
      ...succeededRun,
      runId: "run-accepted",
      kind: "revise",
      isCurrent: true, dismissed: false,
    };
    expect(
      buildWorkspaceNextStep(publishedDetail(acceptedCurrent, acceptedCurrent, true), false).title,
    ).toBe("更新发布");
    expect(
      buildWorkspaceNextStep(publishedDetail(acceptedCurrent, acceptedCurrent, false), false),
    ).toMatchObject({ title: "已发布 v2", done: true });
  });

  it("场景就绪 → 发布；已发布有改动 → 更新发布；已发布无改动 → done", () => {
    expect(buildWorkspaceNextStep(withRuns(succeededRun, succeededRun), false)).toMatchObject({
      tab: "publish",
      title: "发布展览",
      done: false,
    });
    expect(
      buildWorkspaceNextStep(publishedDetail(succeededRun, succeededRun, true), false).title,
    ).toBe("更新发布");
    expect(
      buildWorkspaceNextStep(publishedDetail(succeededRun, succeededRun, false), false),
    ).toMatchObject({ title: "已发布 v2", done: true });
  });
});

describe("网址分区参数", () => {
  it("只接受五个合法分区，其余回退 null", () => {
    expect(parseWorkspaceTab("scene")).toBe("scene");
    expect(parseWorkspaceTab(null)).toBeNull();
    expect(parseWorkspaceTab("settings")).toBeNull();
  });
});
