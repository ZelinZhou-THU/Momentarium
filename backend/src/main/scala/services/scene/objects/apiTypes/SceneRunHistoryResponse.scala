package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** listsceneruns 响应：最新在前。 */
final case class SceneRunHistoryResponse(runs: List[SceneRunSummary])

object SceneRunHistoryResponse:
  given Encoder[SceneRunHistoryResponse] = deriveEncoder[SceneRunHistoryResponse]
  given Decoder[SceneRunHistoryResponse] = deriveDecoder[SceneRunHistoryResponse]
