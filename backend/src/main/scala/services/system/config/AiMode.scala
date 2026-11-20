package services.system.config

/** AI 运行模式：fake 为确定性实现（测试与无网演示），live 才允许真实模型调用。 */
enum AiMode:
  case Live
  case Fake

object AiMode:
  def fromString(value: String): Either[String, AiMode] =
    value.trim.toLowerCase match
      case "live" => Right(AiMode.Live)
      case "fake" => Right(AiMode.Fake)
      case other => Left(s"不支持的 AI_MODE: $other（可选 live 或 fake）")

  def toString(mode: AiMode): String =
    mode match
      case AiMode.Live => "live"
      case AiMode.Fake => "fake"
