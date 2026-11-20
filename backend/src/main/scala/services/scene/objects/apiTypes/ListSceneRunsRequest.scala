package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** listsceneruns 请求：列出该展览的全部场景运行。 */
final case class ListSceneRunsRequest(exhibitionId: ExhibitionId)

object ListSceneRunsRequest:
  given Encoder[ListSceneRunsRequest] = deriveEncoder[ListSceneRunsRequest]
  given Decoder[ListSceneRunsRequest] = deriveDecoder[ListSceneRunsRequest]
