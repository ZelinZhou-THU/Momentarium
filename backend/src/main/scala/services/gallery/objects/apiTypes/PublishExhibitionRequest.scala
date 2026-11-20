package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** 发布/更新发布请求。 */
final case class PublishExhibitionRequest(exhibitionId: ExhibitionId)

object PublishExhibitionRequest:
  given Encoder[PublishExhibitionRequest] = deriveEncoder[PublishExhibitionRequest]
  given Decoder[PublishExhibitionRequest] = deriveDecoder[PublishExhibitionRequest]
