package services.gallery.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}
import scala.util.Try

/** 已采用讲述（记忆）标识；作者视图用它支持移除。 */
final case class PhotoMemoryId(value: UUID)

object PhotoMemoryId:
  given Encoder[PhotoMemoryId] = Encoder.encodeString.contramap(_.value.toString)

  given Decoder[PhotoMemoryId] = Decoder.decodeString.emap { raw =>
    Try(UUID.fromString(raw)).toEither.left.map(_ => s"非法的讲述 ID: $raw").map(PhotoMemoryId.apply)
  }
