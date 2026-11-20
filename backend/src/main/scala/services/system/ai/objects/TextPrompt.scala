package services.system.ai.objects

/** 自由文本生成请求；sessionId 写入 x-opencode-session，同一业务会话内保持稳定。 */
final case class TextPrompt(
  sessionId: String,
  instructions: String,
  temperature: Option[Double] = None,
  system: Option[String] = None
)
