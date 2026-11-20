package services.users.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 用户账户行：密码只保存 BCrypt 哈希。 */
final case class User(id: UserId, username: String, passwordHash: String, createdAt: Instant)

object User:
  given Encoder[User] = deriveEncoder[User]
  given Decoder[User] = deriveDecoder[User]
