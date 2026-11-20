package services.gallery.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}
import scala.util.Try

/** 展览照片标识：跨服务（curation/scene）共享的公开照片 ID，序列化为 UUID 字符串。 */
final case class PhotoId(value: UUID)

object PhotoId:
  given Encoder[PhotoId] = Encoder.encodeString.contramap(_.value.toString)

  given Decoder[PhotoId] = Decoder.decodeString.emap { raw =>
    Try(UUID.fromString(raw)).toEither.left.map(_ => s"非法的照片 ID: $raw").map(PhotoId.apply)
  }
