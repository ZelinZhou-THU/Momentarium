package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** refinecuration 请求体；instruction 是用户的修改指令（≤500 字）。 */
final case class RefineCurationRequest(exhibitionId: ExhibitionId, instruction: String)

object RefineCurationRequest:
  given Encoder[RefineCurationRequest] = deriveEncoder[RefineCurationRequest]
  given Decoder[RefineCurationRequest] = deriveDecoder[RefineCurationRequest]
