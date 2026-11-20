package services.gallery.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}
import scala.util.Try

/** 发布快照标识，序列化为 UUID 字符串。 */
final case class PublicationId(value: UUID)

object PublicationId:
  given Encoder[PublicationId] = Encoder.encodeString.contramap(_.value.toString)

  given Decoder[PublicationId] = Decoder.decodeString.emap { raw =>
    Try(UUID.fromString(raw)).toEither.left.map(_ => s"非法的发布标识: $raw").map(PublicationId.apply)
  }
