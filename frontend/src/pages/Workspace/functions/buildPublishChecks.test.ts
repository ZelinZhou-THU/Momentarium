import { describe, expect, it } from "vitest";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import { buildPublishChecks } from "./buildPublishChecks";

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

const sceneRun = (status: "succeeded" | "generating" | "failed") => ({
  runId: "run-1",
  exhibitionId: "0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10",
  status,
  source: status === "succeeded" ? ("ai" as const) : null,
  attempts: 1,
  kind: "generate" as const,  parentRunId: null,  revisionInstruction: null,  isCurrent: false, dismissed: false,  hint: null,
  photoIds: ["p-1", "p-2", "p-3"],
  curationVersion: 3,
  brief: null,
  code: status === "succeeded" ? "function build(ctx) {}" : null,
  review: null,
  errorCode: null,
  errorMessage: null,
  createdAt: "2026-10-27T09:00:00Z",
  updatedAt: "2026-10-27T09:00:00Z",
});

const readyDetail: ExhibitionDetail = {
  id: "0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10",
  title: "济州岛的记忆",
  narrative: "",
  updatedAt: "2026-10-27T08:00:00Z",
  groups: [
    {
      id: "g-1",
      title: "抵达",
      narrative: "",
      position: 0,
      photos: [photo("p-1"), photo("p-2"), photo("p-3")],
    },
  ],
  ungroupedPhotos: [],
  sceneRun: sceneRun("succeeded"),
  currentSceneRun: sceneRun("succeeded"),
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

const without = (detail: ExhibitionDetail, overrides: Partial<ExhibitionDetail>): ExhibitionDetail => ({
  ...detail,
  ...overrides,
});

const codes = (detail: ExhibitionDetail): readonly string[] =>
  buildPublishChecks(detail).map((check) => check.code);

describe("buildPublishChecks", () => {
  it("条件齐全时没有阻断项", () => {
    expect(buildPublishChecks(readyDetail)).toEqual([]);
  });

  it("照片不足 3 张", () => {
    const detail = without(readyDetail, {
      groups: [{ ...readyDetail.groups[0]!, photos: [photo("p-1"), photo("p-2")] }],
    });
    expect(codes(detail)).toContain("PHOTO_COUNT");
  });

  it("存在未分组照片与空章节", () => {
    const detail = without(readyDetail, {
      ungroupedPhotos: [photo("p-9")],
      groups: [
        ...readyDetail.groups,
        { id: "g-empty", title: "空章", narrative: "", position: 1, photos: [] },
      ],
    });
    expect(codes(detail)).toContain("PHOTO_UNGROUPED");
    expect(codes(detail)).toContain("GROUP_EMPTY");
  });

  it("发布只认 currentSceneRun：最新候选未采用/最新任务生成中都不影响就绪", () => {
    const candidate = {
      ...sceneRun("succeeded"),
      runId: "run-candidate",
      kind: "revise" as const,
      parentRunId: "run-1",
      isCurrent: false, dismissed: false,
    };
    expect(buildPublishChecks(without(readyDetail, { sceneRun: candidate }))).toEqual([]);

    const latestGenerating = without(readyDetail, { sceneRun: sceneRun("generating") });
    expect(buildPublishChecks(latestGenerating)).toEqual([]);

    const latestFailed = without(readyDetail, { sceneRun: sceneRun("failed") });
    expect(buildPublishChecks(latestFailed)).toEqual([]);
  });

  it("没有 currentSceneRun → 未就绪，即使最新运行成功且 sceneStale=false", () => {
    const detail = without(readyDetail, { currentSceneRun: null, sceneRun: sceneRun("succeeded") });
    expect(codes(detail)).toContain("SCENE_NOT_READY");
    expect(codes(detail)).not.toContain("SCENE_STALE");
  });

  it("当前场景非 succeeded → 未就绪；当前 succeeded 但 stale → SCENE_STALE", () => {
    const generatingCurrent = without(readyDetail, { currentSceneRun: sceneRun("generating") });
    expect(codes(generatingCurrent)).toContain("SCENE_NOT_READY");
    expect(codes(generatingCurrent)).not.toContain("SCENE_STALE");

    const stale = without(readyDetail, { sceneStale: true });
    expect(codes(stale)).toContain("SCENE_STALE");
    expect(codes(stale)).not.toContain("SCENE_NOT_READY");
  });

  it("采用修订后 reload 的新 current 让发布恢复就绪", () => {
    const acceptedCurrent = {
      ...sceneRun("succeeded"),
      runId: "run-accepted",
      kind: "revise" as const,
      parentRunId: "run-1",
      isCurrent: true, dismissed: false,
    };
    const accepted = without(readyDetail, {
      currentSceneRun: acceptedCurrent,
      sceneRun: acceptedCurrent,
    });
    expect(buildPublishChecks(accepted)).toEqual([]);
  });

  it("D7 文案：SCENE_STALE=「场景已过期，请重新生成后再发布」，SCENE_NOT_READY 保持原句", () => {
    const stale = buildPublishChecks(without(readyDetail, { sceneStale: true }));
    expect(stale).toEqual([
      { code: "SCENE_STALE", label: "场景已过期，请重新生成后再发布" },
    ]);

    const notReady = buildPublishChecks(
      without(readyDetail, { currentSceneRun: null, sceneRun: sceneRun("succeeded") }),
    );
    expect(notReady).toEqual([{ code: "SCENE_NOT_READY", label: "需要一个生成成功的三维场景" }]);
  });
});
