package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** getcontributionmanagement 响应：一次取邀请与参与者，避免两条读路径。 */
final case class ContributionManagementResponse(
  invites: List[ContributionInviteSummary],
  participants: List[ContributorView]
)

object ContributionManagementResponse:
  given Encoder[ContributionManagementResponse] = deriveEncoder[ContributionManagementResponse]
  given Decoder[ContributionManagementResponse] = deriveDecoder[ContributionManagementResponse]
