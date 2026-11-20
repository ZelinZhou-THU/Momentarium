package services.gallery.objects

import io.circe.{Decoder, Encoder}

/** 位置状态：suggested 为未确认建议，confirmed 为作者已确认；“未知”用没有记录表示。 */
enum LocationStatus:
  case Suggested
  case Confirmed

object LocationStatus:
  def toString(status: LocationStatus): String =
    status match
      case LocationStatus.Suggested => "suggested"
      case LocationStatus.Confirmed => "confirmed"

  def fromString(value: String): Either[String, LocationStatus] =
    value.trim.toLowerCase match
      case "suggested" => Right(LocationStatus.Suggested)
      case "confirmed" => Right(LocationStatus.Confirmed)
      case other => Left(s"不支持的 LocationStatus 值: $other")

  given Encoder[LocationStatus] = Encoder.encodeString.contramap(toString)

  given Decoder[LocationStatus] = Decoder.decodeString.emap(fromString)
