package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** 创建展览响应。 */
final case class CreateExhibitionResponse(exhibitionId: ExhibitionId)

object CreateExhibitionResponse:
  given Encoder[CreateExhibitionResponse] = deriveEncoder[CreateExhibitionResponse]
  given Decoder[CreateExhibitionResponse] = deriveDecoder[CreateExhibitionResponse]
