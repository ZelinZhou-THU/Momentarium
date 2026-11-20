import type { SceneRunView } from "../../../../../objects/gallery/SceneRunView";
import type { ScenePanelStatus } from "../objects/ScenePanelState";

/**
 * 能否进入沉浸观看：只在评审通过、沙箱正在实时预览时。
 * 生成 / 截图 / 评审期间留在页内舞台——截图取画布实际像素，全屏下宽度会超过
 * 1600px 硬门禁（CAPTURE_TOO_WIDE），而且进度信息都在页内。
 */
export const canViewSceneImmersive = (status: ScenePanelStatus, isSandboxShown: boolean): boolean =>
  status === "succeeded" && isSandboxShown;

/** 沉浸层右上角的场景说明：来源 · 修订轮次 · 评审结论。 */
export const describeImmersiveSceneMeta = (run: SceneRunView): string =>
  [
    run.source === "fallback" ? "兜底场景" : "AI 场景",
    run.attempts > 0 ? `第 ${run.attempts} 次修订` : null,
    run.review === null ? null : run.review.verdict === "pass" ? "评审通过" : "评审建议修订",
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
