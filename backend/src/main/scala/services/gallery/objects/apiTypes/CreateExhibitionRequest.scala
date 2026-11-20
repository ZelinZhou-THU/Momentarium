package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 创建展览请求。 */
final case class CreateExhibitionRequest(title: String)

object CreateExhibitionRequest:
  given Encoder[CreateExhibitionRequest] = deriveEncoder[CreateExhibitionRequest]
  given Decoder[CreateExhibitionRequest] = deriveDecoder[CreateExhibitionRequest]
