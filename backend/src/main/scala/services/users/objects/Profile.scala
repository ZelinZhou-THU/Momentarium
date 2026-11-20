package services.users.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** users.profiles 行：公开资料与作者主页开关；没有行时按默认值处理（显示名=用户名、简介空、主页关闭）。 */
final case class Profile(
  userId: UserId,
  displayName: String,
  bio: String,
  homepagePublic: Boolean,
  updatedAt: Instant
)

object Profile:
  given Encoder[Profile] = deriveEncoder[Profile]
  given Decoder[Profile] = deriveDecoder[Profile]
