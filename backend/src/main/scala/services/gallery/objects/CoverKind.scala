package services.gallery.objects

import io.circe.{Decoder, Encoder}

/** 展览封面来源：auto（第一章第一张）、photo（指定照片）、render（场景渲染图）。 */
enum CoverKind:
  case Auto
  case Photo
  case Render

object CoverKind:
  def toString(kind: CoverKind): String =
    kind match
      case CoverKind.Auto => "auto"
      case CoverKind.Photo => "photo"
      case CoverKind.Render => "render"

  def fromString(value: String): Either[String, CoverKind] =
    value.trim.toLowerCase match
      case "auto" => Right(CoverKind.Auto)
      case "photo" => Right(CoverKind.Photo)
      case "render" => Right(CoverKind.Render)
      case other => Left(s"不支持的封面类型: $other")

  given Encoder[CoverKind] = Encoder.encodeString.contramap(kind => toString(kind))

  given Decoder[CoverKind] = Decoder.decodeString.emap(fromString)
