package services.gallery.objects

import io.circe.{Decoder, Encoder}

/** 投稿状态：draft（未提交）→ submitted（进入审阅）→ declined（策展人不采用，可修改后重提）→
  * withdrawn（本人撤回）。上传中间态不落库、不对外。 */
enum ContributionStatus:
  case Draft
  case Submitted
  case Declined
  case Withdrawn

object ContributionStatus:
  def toString(status: ContributionStatus): String =
    status match
      case ContributionStatus.Draft => "draft"
      case ContributionStatus.Submitted => "submitted"
      case ContributionStatus.Declined => "declined"
      case ContributionStatus.Withdrawn => "withdrawn"

  def fromString(value: String): Either[String, ContributionStatus] =
    value.trim.toLowerCase match
      case "draft" => Right(ContributionStatus.Draft)
      case "submitted" => Right(ContributionStatus.Submitted)
      case "declined" => Right(ContributionStatus.Declined)
      case "withdrawn" => Right(ContributionStatus.Withdrawn)
      case other => Left(s"不支持的 ContributionStatus 值: $other")

  given Encoder[ContributionStatus] = Encoder.encodeString.contramap(toString)

  given Decoder[ContributionStatus] = Decoder.decodeString.emap(fromString)
