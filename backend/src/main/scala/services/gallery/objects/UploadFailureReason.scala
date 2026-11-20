package services.gallery.objects

import io.circe.{Decoder, Encoder}

/** 单文件上传失败原因：契约 §0.2 固定集合中的 UPLOAD_* 两项。 */
enum UploadFailureReason:
  case TooLarge
  case UnsupportedType

object UploadFailureReason:
  def toString(reason: UploadFailureReason): String =
    reason match
      case UploadFailureReason.TooLarge => "UPLOAD_TOO_LARGE"
      case UploadFailureReason.UnsupportedType => "UPLOAD_UNSUPPORTED_TYPE"

  def fromString(value: String): Either[String, UploadFailureReason] =
    value.trim match
      case "UPLOAD_TOO_LARGE" => Right(UploadFailureReason.TooLarge)
      case "UPLOAD_UNSUPPORTED_TYPE" => Right(UploadFailureReason.UnsupportedType)
      case other => Left(s"Unsupported UploadFailureReason value: $other")

  given Encoder[UploadFailureReason] = Encoder.encodeString.contramap(reason => toString(reason))

  given Decoder[UploadFailureReason] = Decoder.decodeString.emap(fromString)
