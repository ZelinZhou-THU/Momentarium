package services.system.config

/**
 * 推理强度（OpenAI 兼容接口的 reasoning_effort），随所有模型调用发送。默认 max：
 * 10-30 live 实测（deepseek-v4.1-flash，同题 3 轮）max 的推理 token 比不带参数多约 36%、每轮都更高，且无效值对照没有变化。
 */
enum ReasoningEffort:
  case Low
  case Medium
  case High
  case Max

object ReasoningEffort:
  def fromString(value: String): Either[String, ReasoningEffort] =
    value.trim.toLowerCase match
      case "low" => Right(ReasoningEffort.Low)
      case "medium" => Right(ReasoningEffort.Medium)
      case "high" => Right(ReasoningEffort.High)
      case "max" => Right(ReasoningEffort.Max)
      case other => Left(s"不支持的 AI_REASONING_EFFORT: $other（可选 low、medium、high、max，或 off 不发送）")

  def toString(effort: ReasoningEffort): String =
    effort match
      case ReasoningEffort.Low => "low"
      case ReasoningEffort.Medium => "medium"
      case ReasoningEffort.High => "high"
      case ReasoningEffort.Max => "max"
