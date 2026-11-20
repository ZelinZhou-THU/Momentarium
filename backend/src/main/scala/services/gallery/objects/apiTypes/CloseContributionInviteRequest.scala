package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{ContributionInviteId, ExhibitionId}

/** closecontributioninvite：关闭只阻止新加入，不撤销已有参与者；已关闭幂等。 */
final case class CloseContributionInviteRequest(exhibitionId: ExhibitionId, inviteId: ContributionInviteId)

object CloseContributionInviteRequest:
  given Encoder[CloseContributionInviteRequest] = deriveEncoder[CloseContributionInviteRequest]
  given Decoder[CloseContributionInviteRequest] = deriveDecoder[CloseContributionInviteRequest]
