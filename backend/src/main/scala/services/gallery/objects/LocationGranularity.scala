package services.gallery.objects

import io.circe.{Decoder, Encoder}

/** 公开粒度：hidden 仅草稿可见；area 公开范围代表点；exact 公开精确点。 */
enum LocationGranularity:
  case Hidden
  case Area
  case Exact

object LocationGranularity:
  def toString(granularity: LocationGranularity): String =
    granularity match
      case LocationGranularity.Hidden => "hidden"
      case LocationGranularity.Area => "area"
      case LocationGranularity.Exact => "exact"

  def fromString(value: String): Either[String, LocationGranularity] =
    value.trim.toLowerCase match
      case "hidden" => Right(LocationGranularity.Hidden)
      case "area" => Right(LocationGranularity.Area)
      case "exact" => Right(LocationGranularity.Exact)
      case other => Left(s"不支持的 LocationGranularity 值: $other")

  /** 公开快照与公开视图只允许 area/exact。 */
  def isPublic(granularity: LocationGranularity): Boolean =
    granularity match
      case LocationGranularity.Hidden => false
      case LocationGranularity.Area => true
      case LocationGranularity.Exact => true

  given Encoder[LocationGranularity] = Encoder.encodeString.contramap(toString)

  given Decoder[LocationGranularity] = Decoder.decodeString.emap(fromString)
