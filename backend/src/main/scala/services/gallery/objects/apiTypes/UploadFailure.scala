package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.UploadFailureReason

/** 单文件上传失败：fileName 供前端提示，reason 为契约固定原因码。 */
final case class UploadFailure(fileName: String, reason: UploadFailureReason)

object UploadFailure:
  given Encoder[UploadFailure] = deriveEncoder[UploadFailure]
  given Decoder[UploadFailure] = deriveDecoder[UploadFailure]
