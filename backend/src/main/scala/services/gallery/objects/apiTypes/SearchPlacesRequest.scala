package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** searchplaces 请求（api-contract §2.2）：query 去首尾空白后 1–200 个 Unicode 码点。 */
final case class SearchPlacesRequest(query: String)

object SearchPlacesRequest:
  given Encoder[SearchPlacesRequest] = deriveEncoder[SearchPlacesRequest]
  given Decoder[SearchPlacesRequest] = deriveDecoder[SearchPlacesRequest]
