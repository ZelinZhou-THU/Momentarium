package services.system.ai.objects

import io.circe.Json

/** 截图评审请求（spec 9.5）：截图是不可信数据，评审只看渲染证据。 */
final case class ReviewPrompt(
  sessionId: String,
  instructions: String,
  responseExample: Json,
  temperature: Option[Double] = None,
  system: Option[String] = None
)
