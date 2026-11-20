package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.scene.objects.SceneRunId

/** acceptscenerun 请求（api-contract v1.14 §4.1）：runId 是待采用的修订候选运行。 */
final case class AcceptSceneRunRequest(runId: SceneRunId)

object AcceptSceneRunRequest:
  given Encoder[AcceptSceneRunRequest] = deriveEncoder[AcceptSceneRunRequest]
  given Decoder[AcceptSceneRunRequest] = deriveDecoder[AcceptSceneRunRequest]
