package services.gallery.objects

import io.circe.{Decoder, Encoder}

/** 发布快照状态（spec §5.2）：同一展览任意时刻最多一个 active。 */
enum PublicationStatus:
  case Active
  case Superseded
  case Withdrawn

object PublicationStatus:
  def toString(status: PublicationStatus): String =
    status match
      case PublicationStatus.Active => "active"
      case PublicationStatus.Superseded => "superseded"
      case PublicationStatus.Withdrawn => "withdrawn"

  def fromString(value: String): Either[String, PublicationStatus] =
    value.trim.toLowerCase match
      case "active" => Right(PublicationStatus.Active)
      case "superseded" => Right(PublicationStatus.Superseded)
      case "withdrawn" => Right(PublicationStatus.Withdrawn)
      case other => Left(s"不支持的发布状态: $other")

  given Encoder[PublicationStatus] = Encoder.encodeString.contramap(status => toString(status))

  given Decoder[PublicationStatus] = Decoder.decodeString.emap(fromString)
