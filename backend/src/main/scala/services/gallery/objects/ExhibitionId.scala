package services.gallery.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}
import scala.util.Try

/** 展览标识，序列化为 UUID 字符串。 */
final case class ExhibitionId(value: UUID)

object ExhibitionId:
  given Encoder[ExhibitionId] = Encoder.encodeString.contramap(_.value.toString)

  given Decoder[ExhibitionId] = Decoder.decodeString.emap { raw =>
    Try(UUID.fromString(raw)).toEither.left.map(_ => s"非法的展览 ID: $raw").map(ExhibitionId.apply)
  }
