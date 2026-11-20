import type { RuntimeEvidence } from "../contract";
import type { SceneRuntimeEvidence } from "../../apis/scene/objects/SceneRuntimeEvidence";

/**
 * 客户端运行时证据 → 契约 §4.1 RuntimeEvidence（reviewscene 请求体）。
 * 客户端证据里的调试字段（framesRendered/drawStats/webgl 等）不提交；errors 扁平化成字符串。
 */
export const toSceneRuntimeEvidence = (evidence: RuntimeEvidence): SceneRuntimeEvidence => ({
  buildMs: evidence.buildMs === null ? 0 : Math.round(evidence.buildMs),
  fps: evidence.fps ?? 0,
  errors: evidence.errors.map((entry) => `${entry.phase}: ${entry.name}: ${entry.message}`),
  photoIdsUsed: [...evidence.photoIdsUsed],
  networkAttempts: evidence.networkAttempts,
});
