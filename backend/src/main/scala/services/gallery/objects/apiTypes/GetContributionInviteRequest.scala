package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** getcontributioninvite：公开的邀请预览，凭明文令牌读取；无效令牌统一 404。 */
final case class GetContributionInviteRequest(token: String)

object GetContributionInviteRequest:
  given Encoder[GetContributionInviteRequest] = deriveEncoder[GetContributionInviteRequest]
  given Decoder[GetContributionInviteRequest] = deriveDecoder[GetContributionInviteRequest]
