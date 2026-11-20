package services.scene.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.scene.objects.{RubricScores, SceneRunId, SceneRunKind, SceneRunStatus, SceneSource}

/**
 * 版本历史中的一次运行（api-contract §4.1 v1.14），不含代码与完整题面。
 * weightedScore 与通过判定同源；isCurrent 只比较当前采用场景指针
 * （v1.14 起不再是「最新 succeeded」）；acceptable 是服务端判定的采用资格：
 * kind=revise + succeeded + 父运行仍为当前 + 照片集合/curationVersion/运行时仍匹配 + 非当前。
 * matchesCurrentDraft = 照片集合与策展版本仍与当前草稿一致；restorable = 满足恢复条件。
 * revisionInstruction（v1.15）= 修订运行当时的修订要求，其余运行为 None，供版本列表直接展示。
 * dismissed（v1.19）= 该运行（修订候选）已被创建者放弃；历史里据此标注，仍可恢复为新运行。
 */
final case class SceneRunSummary(
  runId: SceneRunId,
  status: SceneRunStatus,
  source: Option[SceneSource],
  attempts: Int,
  hint: Option[String],
  mood: Option[String],
  scores: Option[RubricScores],
  weightedScore: Option[Double],
  reviewSummary: Option[String],
  errorMessage: Option[String],
  restoredFrom: Option[SceneRunId],
  isCurrent: Boolean,
  matchesCurrentDraft: Boolean,
  restorable: Boolean,
  createdAt: Instant,
  kind: SceneRunKind = SceneRunKind.Generate,
  parentRunId: Option[SceneRunId] = None,
  revisionInstruction: Option[String] = None,
  acceptable: Boolean = false,
  dismissed: Boolean = false
)

object SceneRunSummary:
  given Encoder[SceneRunSummary] = deriveEncoder[SceneRunSummary]
  given Decoder[SceneRunSummary] = deriveDecoder[SceneRunSummary]
