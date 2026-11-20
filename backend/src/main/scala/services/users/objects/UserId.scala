package services.users.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}
import scala.util.Try

/** 用户标识：契约中序列化为 UUID 字符串。 */
final case class UserId(value: UUID)

object UserId:
  given Encoder[UserId] = Encoder.encodeString.contramap(_.value.toString)

  given Decoder[UserId] = Decoder.decodeString.emap { raw =>
    Try(UUID.fromString(raw)).toEither.left.map(_ => s"非法的用户 ID: $raw").map(UserId.apply)
  }
