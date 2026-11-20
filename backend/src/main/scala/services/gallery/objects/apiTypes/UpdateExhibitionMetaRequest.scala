package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** 修改展览标题/叙事请求。 */
final case class UpdateExhibitionMetaRequest(exhibitionId: ExhibitionId, title: String, narrative: String)

object UpdateExhibitionMetaRequest:
  given Encoder[UpdateExhibitionMetaRequest] = deriveEncoder[UpdateExhibitionMetaRequest]
  given Decoder[UpdateExhibitionMetaRequest] = deriveDecoder[UpdateExhibitionMetaRequest]
