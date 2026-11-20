package services.users.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 会话行：只保存令牌的 SHA-256 哈希，原始令牌不落库。 */
final case class Session(tokenHash: String, userId: UserId, createdAt: Instant, expiresAt: Instant)

object Session:
  given Encoder[Session] = deriveEncoder[Session]
  given Decoder[Session] = deriveDecoder[Session]
