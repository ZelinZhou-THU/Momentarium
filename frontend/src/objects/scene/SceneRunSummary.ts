import {
  requireBoolean,
  requireNullable,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from "../../apis/shared/decode";
import { parseRubricScores } from "../gallery/RubricScores";
import type { RubricScores } from "../gallery/RubricScores";
import {
  SCENE_RUN_KINDS,
  SCENE_RUN_SOURCES,
  SCENE_RUN_STATUSES,
} from "../gallery/SceneRunView";
import type { SceneRunKind, SceneRunSource, SceneRunStatus } from "../gallery/SceneRunView";

/** 契约 §4.1 SceneRunSummary：版本历史中的一次运行（不含代码）。 */
export interface SceneRunSummary {
  readonly runId: string;
  readonly status: SceneRunStatus;
  readonly source: SceneRunSource | null;
  readonly attempts: number;
  readonly kind: SceneRunKind;
  readonly parentRunId: string | null;
  /** v1.15：修订运行的修订要求；其余运行为 null。 */
  readonly revisionInstruction: string | null;
  readonly hint: string | null;
  readonly mood: string | null;
  readonly scores: RubricScores | null;
  readonly weightedScore: number | null;
  readonly reviewSummary: string | null;
  readonly errorMessage: string | null;
  readonly restoredFrom: string | null;
  readonly isCurrent: boolean;
  /** 服务端判定的修订候选采用资格（不从前端选中项推断）。 */
  readonly acceptable: boolean;
  /** v1.19：修订候选已被创建者放弃（历史里标注；仍可恢复为新运行）。 */
  readonly dismissed: boolean;
  readonly matchesCurrentDraft: boolean;
  readonly restorable: boolean;
  readonly createdAt: string;
}

export const parseSceneRunSummary = (value: unknown, path = "run"): SceneRunSummary => {
  const record = requireObject(value, path);
  return {
    runId: requireString(record.runId, `${path}.runId`),
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
    mood: requireNullable(record.mood, `${path}.mood`, requireString),
    scores: requireNullable(record.scores, `${path}.scores`, parseRubricScores),
    weightedScore: requireNullable(record.weightedScore, `${path}.weightedScore`, requireNumber),
    reviewSummary: requireNullable(record.reviewSummary, `${path}.reviewSummary`, requireString),
    errorMessage: requireNullable(record.errorMessage, `${path}.errorMessage`, requireString),
    restoredFrom: requireNullable(record.restoredFrom, `${path}.restoredFrom`, requireString),
    isCurrent:
      record.isCurrent === undefined
        ? false
        : requireBoolean(record.isCurrent, `${path}.isCurrent`),
    acceptable:
      record.acceptable === undefined
        ? false
        : requireBoolean(record.acceptable, `${path}.acceptable`),
    dismissed:
      record.dismissed === undefined ? false : requireBoolean(record.dismissed, `${path}.dismissed`),
    matchesCurrentDraft: requireBoolean(record.matchesCurrentDraft, `${path}.matchesCurrentDraft`),
    restorable: requireBoolean(record.restorable, `${path}.restorable`),
    createdAt: requireString(record.createdAt, `${path}.createdAt`),
  };
};
