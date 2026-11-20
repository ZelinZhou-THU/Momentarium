package services.gallery.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}
import scala.util.Try

/** 投稿邀请链接标识；明文令牌只在创建响应返回一次，数据库只存哈希。 */
final case class ContributionInviteId(value: UUID)

object ContributionInviteId:
  given Encoder[ContributionInviteId] = Encoder.encodeString.contramap(_.value.toString)

  given Decoder[ContributionInviteId] = Decoder.decodeString.emap { raw =>
    Try(UUID.fromString(raw)).toEither.left.map(_ => s"非法的邀请 ID: $raw").map(ContributionInviteId.apply)
  }
