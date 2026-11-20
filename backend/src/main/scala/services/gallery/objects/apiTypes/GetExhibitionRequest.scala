package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** 读取展览详情请求。 */
final case class GetExhibitionRequest(exhibitionId: ExhibitionId)

object GetExhibitionRequest:
  given Encoder[GetExhibitionRequest] = deriveEncoder[GetExhibitionRequest]
  given Decoder[GetExhibitionRequest] = deriveDecoder[GetExhibitionRequest]
