package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** 读取公开展览请求（无需令牌，只读 active 快照）。 */
final case class GetPublishedExhibitionRequest(exhibitionId: ExhibitionId)

object GetPublishedExhibitionRequest:
  given Encoder[GetPublishedExhibitionRequest] = deriveEncoder[GetPublishedExhibitionRequest]
  given Decoder[GetPublishedExhibitionRequest] = deriveDecoder[GetPublishedExhibitionRequest]
