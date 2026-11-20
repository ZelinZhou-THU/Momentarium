package services.system.ai.objects

import io.circe.Json

/** 结构化输出请求：responseExample 同时充当模型提示词中的 JSON 形状示例与 fake 实现的确定性返回。 */
final case class StructuredPrompt(
  sessionId: String,
  instructions: String,
  responseExample: Json,
  temperature: Option[Double] = None,
  system: Option[String] = None
)
