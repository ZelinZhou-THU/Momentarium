package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** createcontributioninvite：创建者可为其展览生成一条可关闭的邀请链接。 */
final case class CreateContributionInviteRequest(exhibitionId: ExhibitionId)

object CreateContributionInviteRequest:
  given Encoder[CreateContributionInviteRequest] = deriveEncoder[CreateContributionInviteRequest]
  given Decoder[CreateContributionInviteRequest] = deriveDecoder[CreateContributionInviteRequest]
