package services.system.ai.objects

import io.circe.Json

/** 单张照片的情绪与记忆分析请求（spec 10.1）；图片单独以 ImageBytes 传入。 */
final case class PhotoAnalysisPrompt(
  sessionId: String,
  instructions: String,
  responseExample: Json,
  temperature: Option[Double] = None,
  system: Option[String] = None
)
