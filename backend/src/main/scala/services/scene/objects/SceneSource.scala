package services.scene.objects

import io.circe.{Decoder, Encoder}

/** 场景来源：模型生成（ai）或用尽修订后的兜底工件（fallback）；未成功时为空。 */
enum SceneSource:
  case Ai
  case Fallback

object SceneSource:
  def toString(source: SceneSource): String =
    source match
      case SceneSource.Ai => "ai"
      case SceneSource.Fallback => "fallback"

  def fromString(value: String): Either[String, SceneSource] =
    value.trim.toLowerCase match
      case "ai" => Right(SceneSource.Ai)
      case "fallback" => Right(SceneSource.Fallback)
      case other => Left(s"不支持的场景来源: $other")

  given Encoder[SceneSource] = Encoder.encodeString.contramap(source => toString(source))

  given Decoder[SceneSource] = Decoder.decodeString.emap(fromString)
