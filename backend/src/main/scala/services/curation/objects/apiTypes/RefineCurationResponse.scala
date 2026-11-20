package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** refinecuration 的响应：一句话回复（≤200 字）+ 待用户确认的策展提案。 */
final case class RefineCurationResponse(reply: String, proposal: CurationProposal)

object RefineCurationResponse:
  given Encoder[RefineCurationResponse] = deriveEncoder[RefineCurationResponse]
  given Decoder[RefineCurationResponse] = deriveDecoder[RefineCurationResponse]
