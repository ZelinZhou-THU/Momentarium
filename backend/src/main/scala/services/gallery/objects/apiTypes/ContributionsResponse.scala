package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** listcontributions 响应：按角色过滤后的投稿列表（创建者不含 draft；投稿者含自己的全部状态）。 */
final case class ContributionsResponse(contributions: List[ContributionSummary])

object ContributionsResponse:
  given Encoder[ContributionsResponse] = deriveEncoder[ContributionsResponse]
  given Decoder[ContributionsResponse] = deriveDecoder[ContributionsResponse]
