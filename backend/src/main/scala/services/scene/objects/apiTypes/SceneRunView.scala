package services.scene.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{ExhibitionId, PhotoId}
import services.scene.objects.{SceneBrief, SceneReview, SceneRunId, SceneRunKind, SceneRunStatus, SceneSource}

/**
 * 场景运行视图（api-contract §4.1 v1.14）：status/source 为小写字符串，Option 字段序列化为 null。
 * kind 表示运行起因；parentRunId/revisionInstruction 仅修订运行；isCurrent 只比较
 * gallery.exhibitions.current_scene_run_id 指针（不是「最新 succeeded」）。
 * 这是面向前端的传输类型，故放在 objects/apiTypes/（rules 24）。
 */
final case class SceneRunView(
  runId: SceneRunId,
  exhibitionId: ExhibitionId,
  status: SceneRunStatus,
  source: Option[SceneSource],
  attempts: Int,
  hint: Option[String],
  photoIds: List[PhotoId],
  curationVersion: Int,
  brief: Option[SceneBrief],
  code: Option[String],
  review: Option[SceneReview],
  errorCode: Option[String],
  errorMessage: Option[String],
  createdAt: Instant,
  updatedAt: Instant,
  kind: SceneRunKind = SceneRunKind.Generate,
  parentRunId: Option[SceneRunId] = None,
  revisionInstruction: Option[String] = None,
  isCurrent: Boolean = false,
  dismissed: Boolean = false
)

object SceneRunView:
  given Encoder[SceneRunView] = deriveEncoder[SceneRunView]
  given Decoder[SceneRunView] = deriveDecoder[SceneRunView]
