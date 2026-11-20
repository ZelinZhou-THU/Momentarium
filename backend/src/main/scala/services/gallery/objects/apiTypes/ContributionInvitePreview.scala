package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ContributionInviteStatus

/** 公开邀请预览：只显示展览标题、邀请人展示名（v1.17）与链接状态，不泄露封面/照片/成员等私有内容。 */
final case class ContributionInvitePreview(
  exhibitionTitle: String,
  inviterName: String,
  status: ContributionInviteStatus
)

object ContributionInvitePreview:
  given Encoder[ContributionInvitePreview] = deriveEncoder[ContributionInvitePreview]
  given Decoder[ContributionInvitePreview] = deriveDecoder[ContributionInvitePreview]
