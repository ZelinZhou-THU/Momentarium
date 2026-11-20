package services.gallery.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{ContributorStatus, ExhibitionId}

/** 加入兑换结果（已加入时幂等返回 active 成员视图）。 */
final case class ContributionMembershipView(
  exhibitionId: ExhibitionId,
  exhibitionTitle: String,
  status: ContributorStatus,
  joinedAt: Instant
)

object ContributionMembershipView:
  given Encoder[ContributionMembershipView] = deriveEncoder[ContributionMembershipView]
  given Decoder[ContributionMembershipView] = deriveDecoder[ContributionMembershipView]
