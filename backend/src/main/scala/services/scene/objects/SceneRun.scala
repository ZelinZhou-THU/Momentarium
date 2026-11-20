package services.scene.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{ExhibitionId, PhotoId}
import services.scene.objects.apiTypes.RuntimeEvidence
import services.users.objects.UserId

/**
 * scene.scene_runs 行：一次场景运行（生成/修订/恢复）的全部状态与产物（spec §7）。
 * kind 表示运行起因（与 source 产物来源独立）；parentRunId/revisionInstruction 仅用户修订使用；
 * restoredFrom 仍只表示恢复来源。
 */
final case class SceneRun(
  id: SceneRunId,
  exhibitionId: ExhibitionId,
  requestedBy: UserId,
  status: SceneRunStatus,
  source: Option[SceneSource],
  hint: Option[String],
  photoIds: List[PhotoId],
  curationVersion: Int,
  runtimeVersion: String,
  brief: Option[SceneBrief],
  code: Option[String],
  review: Option[SceneReview],
  runtimeEvidence: Option[RuntimeEvidence],
  attempts: Int,
  promptVersion: String,
  errorCode: Option[String],
  errorMessage: Option[String],
  createdAt: Instant,
  updatedAt: Instant,
  restoredFrom: Option[SceneRunId] = None,
  buildRepairs: Int = 0,
  kind: SceneRunKind = SceneRunKind.Generate,
  parentRunId: Option[SceneRunId] = None,
  revisionInstruction: Option[String] = None,
  dismissed: Boolean = false
)

object SceneRun:
  given Encoder[SceneRun] = deriveEncoder[SceneRun]
  given Decoder[SceneRun] = deriveDecoder[SceneRun]
