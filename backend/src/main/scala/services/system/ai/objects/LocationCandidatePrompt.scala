package services.system.ai.objects

import io.circe.Json

/** 单张照片的地点候选建议请求（阶段 3，photo-location-v1）；图片单独以 ImageBytes 传入。
  * 与 PhotoAnalysisPrompt 独立：地点识别与情绪/记忆分析是两个模型能力，互不影响提示词版本。 */
final case class LocationCandidatePrompt(
  sessionId: String,
  instructions: String,
  responseExample: Json,
  temperature: Option[Double] = None,
  system: Option[String] = None
)
