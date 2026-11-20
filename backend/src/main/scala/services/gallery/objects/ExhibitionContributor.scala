package services.gallery.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.users.objects.UserId

/** gallery.exhibition_contributors：一行 =（展览, 用户）；撤销是终态，关闭邀请不撤销已有参与者。 */
final case class ExhibitionContributor(
  exhibitionId: ExhibitionId,
  userId: UserId,
  inviteId: Option[ContributionInviteId],
  status: ContributorStatus,
  joinedAt: Instant,
  revokedAt: Option[Instant],
  updatedAt: Instant
)

object ExhibitionContributor:
  given Encoder[ExhibitionContributor] = deriveEncoder[ExhibitionContributor]
  given Decoder[ExhibitionContributor] = deriveDecoder[ExhibitionContributor]
