import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import { buildPublishChecks } from "./buildPublishChecks";
import { countPhotos } from "./countPhotos";
import type { WorkspaceTabId } from "./workspaceTabs";

/** 工作台"下一步"：当前最该做的一件事落在哪个分区；done 表示流程已走完（已发布且无改动）。 */
export interface WorkspaceNextStep {
  readonly tab: WorkspaceTabId;
  readonly title: string;
  readonly message: string;
  readonly done: boolean;
  /** 前往时顺带打开策展里的「AI 灵感」面板（还没有章节时）。 */
  readonly openInspiration: boolean;
}

const ACTIVE_RUN_STATUSES: ReadonlySet<string> = new Set(["queued", "generating", "reviewing"]);

const step = (tab: WorkspaceTabId, title: string, message: string): WorkspaceNextStep => ({
  tab,
  title,
  message,
  done: false,
  openInspiration: false,
});

/**
 * 由详情（服务端状态）与策展草稿是否有未保存修改推断下一步，顺序即创作流程：
 * 保存草稿 → 照片 ≥3 → 分章节（无章节时打开策展里的 AI 灵感）→ 场景 → 发布。
 * 阻断条件与 buildPublishChecks 同源，保证"下一步"与发布校验口径一致。
 */
export const buildWorkspaceNextStep = (
  detail: ExhibitionDetail,
  curationDirty: boolean,
): WorkspaceNextStep => {
  if (curationDirty) {
    return step("curation", "保存策展修改", "有未保存的策展修改，保存后才会用于场景生成与发布。");
  }

  const codes = new Set(buildPublishChecks(detail).map((check) => check.code));
  const photoCount = countPhotos(detail);

  if (codes.has("PHOTO_COUNT")) {
    return step("photos", "上传照片", `展览至少需要 3 张照片，目前 ${photoCount} 张。`);
  }
  if (detail.groups.length === 0) {
    return {
      ...step("curation", "让 AI 给出主题提案", "展开「策展」里的 AI 灵感，生成几个章节方向，应用后再细调。"),
      openInspiration: true,
    };
  }
  if (codes.has("PHOTO_UNGROUPED") || codes.has("GROUP_EMPTY")) {
    return step("curation", "整理章节", "把所有照片放进章节、补齐空章节，然后保存策展。");
  }

  const run = detail.sceneRun;
  if (run !== null && run.status === "awaiting_capture") {
    // 截图需要场景面板可见（captureVisibility），所以这里明确请用户回到场景分区。
    return step("scene", "场景待渲染截图", "请停留在「三维场景」，渲染截图完成后才会进入评审。");
  }
  if (run !== null && ACTIVE_RUN_STATUSES.has(run.status)) {
    return step("scene", "场景生成中", "可以在「三维场景」查看进度，也可以先去别处，生成不会中断。");
  }
  if (codes.has("SCENE_STALE")) {
    return step("scene", "重新生成场景", "当前采用的场景已过期，需要重新生成并采用后才能发布。");
  }
  if (codes.has("SCENE_NOT_READY")) {
    // 发布只认 currentSceneRun；最新运行失败/候选未采用都不是“可发布”，也不拿它判断当前场景状态。
    return step(
      "scene",
      "生成三维场景",
      detail.currentSceneRun === null
        ? "还没有当前采用的三维场景；先生成并采用一个场景，发布才可用。"
        : "当前采用的场景不可用，请重新生成并采用后再发布。",
    );
  }

  if (detail.publication === null) {
    return step("publish", "发布展览", "一切就绪，发布后会得到一个任何人都能打开的公开链接。");
  }
  if (detail.hasUnpublishedChanges) {
    return step("publish", "更新发布", "有修改还没有同步到公开页。");
  }
  return {
    tab: "publish",
    title: `已发布 v${detail.publication.version}`,
    message: "公开页与当前草稿一致。",
    done: true,
    openInspiration: false,
  };
};
