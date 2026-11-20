package services.gallery.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ContributionInviteId

/** 创建邀请的响应：明文令牌只返回这一次，数据库只存 SHA-256。 */
final case class ContributionInviteCreated(inviteId: ContributionInviteId, token: String, createdAt: Instant)

object ContributionInviteCreated:
  given Encoder[ContributionInviteCreated] = deriveEncoder[ContributionInviteCreated]
  given Decoder[ContributionInviteCreated] = deriveDecoder[ContributionInviteCreated]
