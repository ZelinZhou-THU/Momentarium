package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.scene.objects.SceneRunId

final case class DismissSceneRunRequest(runId: SceneRunId)

object DismissSceneRunRequest:
  given Encoder[DismissSceneRunRequest] = deriveEncoder[DismissSceneRunRequest]
  given Decoder[DismissSceneRunRequest] = deriveDecoder[DismissSceneRunRequest]
