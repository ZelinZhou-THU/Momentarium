package services.gallery.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{ContributionInviteId, ContributionInviteStatus}

/** 邀请链接摘要（管理列表与关闭响应）：不回传明文令牌。 */
final case class ContributionInviteSummary(
  id: ContributionInviteId,
  status: ContributionInviteStatus,
  createdAt: Instant,
  closedAt: Option[Instant]
)

object ContributionInviteSummary:
  given Encoder[ContributionInviteSummary] = deriveEncoder[ContributionInviteSummary]
  given Decoder[ContributionInviteSummary] = deriveDecoder[ContributionInviteSummary]
