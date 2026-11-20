package services.gallery.objects

import io.circe.{Decoder, Encoder}

/** 邀请链接状态：关闭只阻止新加入，不撤销已有参与者。 */
enum ContributionInviteStatus:
  case Active
  case Closed

object ContributionInviteStatus:
  def toString(status: ContributionInviteStatus): String =
    status match
      case ContributionInviteStatus.Active => "active"
      case ContributionInviteStatus.Closed => "closed"

  def fromString(value: String): Either[String, ContributionInviteStatus] =
    value.trim.toLowerCase match
      case "active" => Right(ContributionInviteStatus.Active)
      case "closed" => Right(ContributionInviteStatus.Closed)
      case other => Left(s"不支持的 ContributionInviteStatus 值: $other")

  given Encoder[ContributionInviteStatus] = Encoder.encodeString.contramap(toString)

  given Decoder[ContributionInviteStatus] = Decoder.decodeString.emap(fromString)
