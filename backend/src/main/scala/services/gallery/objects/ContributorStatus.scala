package services.gallery.objects

import io.circe.{Decoder, Encoder}

/** 参与关系状态：active 可投稿；revoked 为终态（v1 不可重新加入），仍可查看/撤回自己的投稿。 */
enum ContributorStatus:
  case Active
  case Revoked

object ContributorStatus:
  def toString(status: ContributorStatus): String =
    status match
      case ContributorStatus.Active => "active"
      case ContributorStatus.Revoked => "revoked"

  def fromString(value: String): Either[String, ContributorStatus] =
    value.trim.toLowerCase match
      case "active" => Right(ContributorStatus.Active)
      case "revoked" => Right(ContributorStatus.Revoked)
      case other => Left(s"不支持的 ContributorStatus 值: $other")

  given Encoder[ContributorStatus] = Encoder.encodeString.contramap(toString)

  given Decoder[ContributorStatus] = Decoder.decodeString.emap(fromString)
