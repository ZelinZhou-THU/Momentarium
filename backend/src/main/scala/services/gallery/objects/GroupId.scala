package services.gallery.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}
import scala.util.Try

/** 展览章节标识，序列化为 UUID 字符串。 */
final case class GroupId(value: UUID)

object GroupId:
  given Encoder[GroupId] = Encoder.encodeString.contramap(_.value.toString)

  given Decoder[GroupId] = Decoder.decodeString.emap { raw =>
    Try(UUID.fromString(raw)).toEither.left.map(_ => s"非法的章节 ID: $raw").map(GroupId.apply)
  }
