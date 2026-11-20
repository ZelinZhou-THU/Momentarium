package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** getphotoinsights 请求：读取该展览照片的 AI 解读。 */
final case class GetPhotoInsightsRequest(exhibitionId: ExhibitionId)

object GetPhotoInsightsRequest:
  given Encoder[GetPhotoInsightsRequest] = deriveEncoder[GetPhotoInsightsRequest]
  given Decoder[GetPhotoInsightsRequest] = deriveDecoder[GetPhotoInsightsRequest]
