package services.gallery.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.users.objects.UserId

/** gallery.contribution_invites：可关闭的邀请链接；DB 只存令牌 SHA-256，明文只在创建响应返回一次。 */
final case class ContributionInvite(
  id: ContributionInviteId,
  exhibitionId: ExhibitionId,
  tokenHash: String,
  status: ContributionInviteStatus,
  createdBy: UserId,
  createdAt: Instant,
  closedAt: Option[Instant]
)

object ContributionInvite:
  given Encoder[ContributionInvite] = deriveEncoder[ContributionInvite]
  given Decoder[ContributionInvite] = deriveDecoder[ContributionInvite]
