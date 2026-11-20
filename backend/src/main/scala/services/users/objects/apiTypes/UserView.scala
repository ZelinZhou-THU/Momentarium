package services.users.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.users.objects.UserId

/** 前端可见的用户视图，不含密码哈希。 */
final case class UserView(id: UserId, username: String, createdAt: Instant)

object UserView:
  given Encoder[UserView] = deriveEncoder[UserView]
  given Decoder[UserView] = deriveDecoder[UserView]
