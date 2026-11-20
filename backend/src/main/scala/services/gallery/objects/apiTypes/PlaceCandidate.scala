package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 地点搜索候选（api-contract §2.1）：name 为地点名，displayName 为提供方完整显示名。 */
final case class PlaceCandidate(name: String, displayName: String, latitude: Double, longitude: Double)

object PlaceCandidate:
  given Encoder[PlaceCandidate] = deriveEncoder[PlaceCandidate]
  given Decoder[PlaceCandidate] = deriveDecoder[PlaceCandidate]
