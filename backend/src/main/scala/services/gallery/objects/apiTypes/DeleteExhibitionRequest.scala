package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** 删除展览请求。 */
final case class DeleteExhibitionRequest(exhibitionId: ExhibitionId)

object DeleteExhibitionRequest:
  given Encoder[DeleteExhibitionRequest] = deriveEncoder[DeleteExhibitionRequest]
  given Decoder[DeleteExhibitionRequest] = deriveDecoder[DeleteExhibitionRequest]
