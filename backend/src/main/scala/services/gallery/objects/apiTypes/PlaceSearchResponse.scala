package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 地点搜索响应（api-contract §2.1）：无结果返回空数组，不返回错误。 */
final case class PlaceSearchResponse(candidates: List[PlaceCandidate])

object PlaceSearchResponse:
  given Encoder[PlaceSearchResponse] = deriveEncoder[PlaceSearchResponse]
  given Decoder[PlaceSearchResponse] = deriveDecoder[PlaceSearchResponse]
