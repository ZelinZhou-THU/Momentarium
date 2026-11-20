import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import { countPhotos } from "./countPhotos";

/** 发布前校验原因码：与 api-contract §0.2 的 reason 集一致（publish 响应错误同源）。 */
export type PublishCheckCode =
  | "PHOTO_COUNT"
  | "PHOTO_UNGROUPED"
  | "GROUP_EMPTY"
  | "SCENE_NOT_READY"
  | "SCENE_STALE";

export interface PublishCheck {
  readonly code: PublishCheckCode;
  readonly label: string;
}

const SCENE_NOT_READY_CHECK: PublishCheck = {
  code: "SCENE_NOT_READY",
  label: "需要一个生成成功的三维场景",
};

const SCENE_STALE_CHECK: PublishCheck = {
  code: "SCENE_STALE",
  label: "场景已过期，请重新生成后再发布",
};

/**
 * 场景就绪判定来源（v1.14）：发布只冻结 currentSceneRun（当前采用指针）。
 * - 没有当前采用场景（含从未生成、修订候选未采用）→ SCENE_NOT_READY；
 * - 当前场景非 succeeded → SCENE_NOT_READY；succeeded 但 sceneStale → SCENE_STALE；
 * - 最新 sceneRun 只表示进度/候选，不参与发布判断。
 */
const buildSceneCheck = (detail: ExhibitionDetail): PublishCheck | null => {
  const current = detail.currentSceneRun;
  if (current === null || current.status !== "succeeded") {
    return SCENE_NOT_READY_CHECK;
  }
  return detail.sceneStale ? SCENE_STALE_CHECK : null;
};

/**
 * 由当前草稿推断发布前还缺什么（spec §9.6 发布校验；与 publish 后端校验 reason 对齐）。
 * 只依赖 detail 的既有字段，不额外请求。
 */
export const buildPublishChecks = (detail: ExhibitionDetail): readonly PublishCheck[] => {
  const checks: PublishCheck[] = [];

  if (countPhotos(detail) < 3) {
    checks.push({ code: "PHOTO_COUNT", label: "展览至少需要 3 张照片" });
  }
  if (detail.ungroupedPhotos.length > 0) {
    checks.push({
      code: "PHOTO_UNGROUPED",
      label: `还有 ${detail.ungroupedPhotos.length} 张照片没有放入章节`,
    });
  }
  if (detail.groups.some((group) => group.photos.length === 0)) {
    checks.push({ code: "GROUP_EMPTY", label: "存在空章节，请补充照片或删除章节" });
  }

  const sceneCheck = buildSceneCheck(detail);
  if (sceneCheck !== null) {
    checks.push(sceneCheck);
  }

  return checks;
};
