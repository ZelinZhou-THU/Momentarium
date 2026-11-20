package services.system.config

/** 模型调用协议；MVP 只支持 OpenAI Chat Completions。 */
enum AiProtocol:
  case OpenAi

object AiProtocol:
  def fromString(value: String): Either[String, AiProtocol] =
    value.trim.toLowerCase match
      case "openai" => Right(AiProtocol.OpenAi)
      case other => Left(s"不支持的模型协议: $other（MVP 仅支持 openai）")

  def toString(protocol: AiProtocol): String =
    protocol match
      case AiProtocol.OpenAi => "openai"
