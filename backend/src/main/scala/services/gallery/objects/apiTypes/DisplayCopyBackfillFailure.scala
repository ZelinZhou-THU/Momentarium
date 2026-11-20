package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 展示副本回填的单条失败：subject 为照片 id 或 render 封面文件名（不含物理路径），reason 为稳定短原因。 */
final case class DisplayCopyBackfillFailure(subject: String, reason: String)

object DisplayCopyBackfillFailure:
  given Encoder[DisplayCopyBackfillFailure] = deriveEncoder[DisplayCopyBackfillFailure]
  given Decoder[DisplayCopyBackfillFailure] = deriveDecoder[DisplayCopyBackfillFailure]
