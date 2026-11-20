package services.gallery.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}
import scala.util.Try

/** 投稿标识：一稿 = 一张照片 + 一段回忆 + 一个位置建议 + 版本；序列化为 UUID 字符串。 */
final case class ContributionId(value: UUID)

object ContributionId:
  given Encoder[ContributionId] = Encoder.encodeString.contramap(_.value.toString)

  given Decoder[ContributionId] = Decoder.decodeString.emap { raw =>
    Try(UUID.fromString(raw)).toEither.left.map(_ => s"非法的投稿 ID: $raw").map(ContributionId.apply)
  }
