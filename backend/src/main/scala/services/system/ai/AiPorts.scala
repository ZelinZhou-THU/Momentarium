package services.system.ai

import services.system.ai.fake.{FakeLocationModel, FakeReviewModel, FakeTextModel, FakeVisionModel}
import services.system.ai.openai.OpenAiChatClient
import services.system.ai.ports.{LocationModel, ReviewModel, TextModel, VisionModel}
import services.system.config.{AiConfig, AiMode}

/** 四个 AI 端口的集合：curation 用 text/vision/location，scene 用 text/review，由启动装配按 AI_MODE 选择实现。 */
final case class AiPorts(text: TextModel, vision: VisionModel, location: LocationModel, review: ReviewModel)

object AiPorts:

  /** 确定性实现：无网络、可完整演示与测试。 */
  def fake: AiPorts =
    val text = FakeTextModel()
    AiPorts(text, FakeVisionModel(), FakeLocationModel(), FakeReviewModel())

  /** live 模式必须有密钥；缺失时启动即失败，不允许把空串当密钥发出去。 */
  def fromConfig(config: AiConfig): Either[String, AiPorts] =
    config.mode match
      case AiMode.Fake => Right(fake)
      case AiMode.Live =>
        config.apiKey.filter(_.trim.nonEmpty) match
          case Some(apiKey) =>
            val client = OpenAiChatClient.live(config, apiKey)
            Right(AiPorts(client, client, client, client))
          case None => Left("AI_MODE=live 但 AI_API_KEY 未配置")
