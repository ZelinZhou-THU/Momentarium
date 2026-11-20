package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** getpublishedscene 请求（api-contract §4.2）：公开、无令牌，只读 active 快照绑定的场景。 */
final case class GetPublishedSceneRequest(exhibitionId: ExhibitionId)

object GetPublishedSceneRequest:
  given Encoder[GetPublishedSceneRequest] = deriveEncoder[GetPublishedSceneRequest]
  given Decoder[GetPublishedSceneRequest] = deriveDecoder[GetPublishedSceneRequest]
