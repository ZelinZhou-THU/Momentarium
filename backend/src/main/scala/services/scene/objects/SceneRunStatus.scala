package services.scene.objects

import io.circe.{Decoder, Encoder}

/** 场景运行状态机（spec 6.6 / 9.6）；DB 与 API 均用小写字符串。 */
enum SceneRunStatus:
  case Queued
  case Generating
  case AwaitingCapture
  case Reviewing
  case Succeeded
  case Failed
  case Cancelled

object SceneRunStatus:
  def toString(status: SceneRunStatus): String =
    status match
      case SceneRunStatus.Queued => "queued"
      case SceneRunStatus.Generating => "generating"
      case SceneRunStatus.AwaitingCapture => "awaiting_capture"
      case SceneRunStatus.Reviewing => "reviewing"
      case SceneRunStatus.Succeeded => "succeeded"
      case SceneRunStatus.Failed => "failed"
      case SceneRunStatus.Cancelled => "cancelled"

  def fromString(value: String): Either[String, SceneRunStatus] =
    value.trim.toLowerCase match
      case "queued" => Right(SceneRunStatus.Queued)
      case "generating" => Right(SceneRunStatus.Generating)
      case "awaiting_capture" => Right(SceneRunStatus.AwaitingCapture)
      case "reviewing" => Right(SceneRunStatus.Reviewing)
      case "succeeded" => Right(SceneRunStatus.Succeeded)
      case "failed" => Right(SceneRunStatus.Failed)
      case "cancelled" => Right(SceneRunStatus.Cancelled)
      case other => Left(s"不支持的场景运行状态: $other")

  given Encoder[SceneRunStatus] = Encoder.encodeString.contramap(status => toString(status))

  given Decoder[SceneRunStatus] = Decoder.decodeString.emap(fromString)
