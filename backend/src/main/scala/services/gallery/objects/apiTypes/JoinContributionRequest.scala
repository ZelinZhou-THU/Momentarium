package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** joincontribution：登录用户凭有效邀请令牌兑换加入展览。 */
final case class JoinContributionRequest(token: String)

object JoinContributionRequest:
  given Encoder[JoinContributionRequest] = deriveEncoder[JoinContributionRequest]
  given Decoder[JoinContributionRequest] = deriveDecoder[JoinContributionRequest]
