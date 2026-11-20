package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.users.objects.UserId

/** 投稿者简要信息：创建者审阅列表与投稿者自己的列表共用；显示名缺失时回退用户名。 */
final case class ContributorBrief(contributorId: UserId, username: String, displayName: String)

object ContributorBrief:
  given Encoder[ContributorBrief] = deriveEncoder[ContributorBrief]
  given Decoder[ContributorBrief] = deriveDecoder[ContributorBrief]
