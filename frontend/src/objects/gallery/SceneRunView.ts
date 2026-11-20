import {
  requireBoolean,
  requireNullable,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
  requireStringArray,
} from "../../apis/shared/decode";
import { parseSceneBrief } from "./SceneBrief";
import type { SceneBrief } from "./SceneBrief";
import { parseSceneReview } from "./SceneReview";
import type { SceneReview } from "./SceneReview";

/** 契约 §4.1 SceneRunView.status：场景运行状态机。 */
export const SCENE_RUN_STATUSES = [
  "queued",
  "generating",
  "awaiting_capture",
  "reviewing",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type SceneRunStatus = (typeof SCENE_RUN_STATUSES)[number];

/** 契约 §4.1 SceneRunView.source：场景来源（AI 生成 / 兜底）。 */
export const SCENE_RUN_SOURCES = ["ai", "fallback"] as const;

export type SceneRunSource = (typeof SCENE_RUN_SOURCES)[number];

/** 契约 v1.14 运行起因：生成 / 用户修订 / 恢复；与 source=ai|fallback 的产物来源独立。 */
export const SCENE_RUN_KINDS = ["generate", "revise", "restore"] as const;

export type SceneRunKind = (typeof SCENE_RUN_KINDS)[number];

/** 契约 §4.1 SceneRunView：工作台场景区域的运行快照。 */
export interface SceneRunView {
  readonly runId: string;
  readonly exhibitionId: string;
  readonly status: SceneRunStatus;
  readonly source: SceneRunSource | null;
  readonly attempts: number;
  readonly kind: SceneRunKind;
  readonly parentRunId: string | null;
  readonly revisionInstruction: string | null;
  readonly hint: string | null;
  readonly photoIds: string[];
  readonly curationVersion: number;
  readonly brief: SceneBrief | null;
  readonly code: string | null;
  readonly review: SceneReview | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  /** 是否是指针 current_scene_run_id 指向的当前采用运行；最新运行不一定当前。 */
  readonly isCurrent: boolean;
  readonly dismissed: boolean;
  /** 运行创建时间（ISO-8601）：前端据此显示已用时长，刷新不归零。 */
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const parseSceneRunView = (value: unknown, path = "sceneRun"): SceneRunView => {
  const record = requireObject(value, path);
  return {
    runId: requireString(record.runId, `${path}.runId`),
    exhibitionId: requireString(record.exhibitionId, `${path}.exhibitionId`),
    status: requireOneOf(record.status, SCENE_RUN_STATUSES, `${path}.status`),
    source: requireNullable(record.source, `${path}.source`, (inner, innerPath) =>
      requireOneOf(inner, SCENE_RUN_SOURCES, innerPath),
    ),
    attempts: requireNumber(record.attempts, `${path}.attempts`),
    // v1.14 新增字段：旧数据/旧夹具缺省按 generate/null/false 兼容。
    kind:
      record.kind === undefined
        ? "generate"
        : requireOneOf(record.kind, SCENE_RUN_KINDS, `${path}.kind`),
    parentRunId: requireNullable(record.parentRunId ?? null, `${path}.parentRunId`, requireString),
    revisionInstruction: requireNullable(
      record.revisionInstruction ?? null,
      `${path}.revisionInstruction`,
      requireString,
    ),
    hint: requireNullable(record.hint, `${path}.hint`, requireString),
    photoIds: requireStringArray(record.photoIds, `${path}.photoIds`),
    curationVersion: requireNumber(record.curationVersion, `${path}.curationVersion`),
    brief: requireNullable(record.brief, `${path}.brief`, parseSceneBrief),
    code: requireNullable(record.code, `${path}.code`, requireString),
    review: requireNullable(record.review, `${path}.review`, parseSceneReview),
    errorCode: requireNullable(record.errorCode, `${path}.errorCode`, requireString),
    errorMessage: requireNullable(record.errorMessage, `${path}.errorMessage`, requireString),
    isCurrent:
      record.isCurrent === undefined
        ? false
        : requireBoolean(record.isCurrent, `${path}.isCurrent`),
    dismissed: record.dismissed === undefined ? false : requireBoolean(record.dismissed, `${path}.dismissed`),
    createdAt: requireString(record.createdAt, `${path}.createdAt`),
    updatedAt: requireString(record.updatedAt, `${path}.updatedAt`),
  };
};
