package services.gallery.objects

import io.circe.{Decoder, Encoder}

/** 位置来源：exif 为上传时本地解析的建议，manual 为作者录入/确认，ai 为阶段 3 候选确认（阶段 1 不产出）。 */
enum LocationSource:
  case Exif
  case Manual
  case Ai

object LocationSource:
  def toString(source: LocationSource): String =
    source match
      case LocationSource.Exif => "exif"
      case LocationSource.Manual => "manual"
      case LocationSource.Ai => "ai"

  def fromString(value: String): Either[String, LocationSource] =
    value.trim.toLowerCase match
      case "exif" => Right(LocationSource.Exif)
      case "manual" => Right(LocationSource.Manual)
      case "ai" => Right(LocationSource.Ai)
      case other => Left(s"不支持的 LocationSource 值: $other")

  given Encoder[LocationSource] = Encoder.encodeString.contramap(toString)

  given Decoder[LocationSource] = Decoder.decodeString.emap(fromString)
