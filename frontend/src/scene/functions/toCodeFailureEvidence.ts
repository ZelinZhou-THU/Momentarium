import type { SceneRuntimeEvidence } from "../../apis/scene/objects/SceneRuntimeEvidence";
import type { SceneSandboxFailureCode } from "../sandbox";

/** 由生成代码本身导致的沙箱失败：交给评审回灌修复；其余（WebGL/资源/超时截图等）是环境问题，留给用户重试。 */
const CODE_FAILURE_CODES: readonly SceneSandboxFailureCode[] = ["CODE_INVALID", "BUILD_FAILED", "BUILD_TIMEOUT"];

export const isCodeFailure = (code: SceneSandboxFailureCode): boolean =>
  CODE_FAILURE_CODES.some((candidate) => candidate === code);

/**
 * 代码导致的沙箱失败 → reviewscene 的运行时证据（截图为空、errors 带错误码与定位）。
 * 服务端硬门禁据此判为「构建阶段崩溃」，在修订额度内把错误原文交给修复提示词；环境失败返回 null。
 */
export const toCodeFailureEvidence = (
  code: SceneSandboxFailureCode,
  phase: string,
  message: string,
): SceneRuntimeEvidence | null =>
  isCodeFailure(code)
    ? { buildMs: 0, fps: 0, errors: [`${phase}: ${code}: ${message}`], photoIdsUsed: [], networkAttempts: 0 }
    : null;
