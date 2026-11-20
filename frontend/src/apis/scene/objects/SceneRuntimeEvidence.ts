/**
 * 契约 §4.1 RuntimeEvidence（reviewscene 请求里的服务端形状）。
 *
 * 注意：它与 SceneRuntime 在沙箱里产出的客户端证据不是同一形状——客户端证据还包含
 * framesRendered/drawStats/webgl 等调试字段，提交评审前由
 * `scene/functions/toSceneRuntimeEvidence.ts` 收敛成这个契约形状。
 */
export interface SceneRuntimeEvidence {
  readonly buildMs: number;
  readonly fps: number;
  readonly errors: readonly string[];
  readonly photoIdsUsed: readonly string[];
  readonly networkAttempts: number;
}
