package services.system.ai.fake

import cats.effect.IO
import io.circe.Decoder

import services.system.ai.objects.{StructuredPrompt, TextPrompt}
import services.system.ai.ports.TextModel
import services.system.api.{ApiError, ApiException}
import services.system.assets.FoggyCoastScene

/**
 * 确定性文本模型（AI_MODE=fake / 测试）：
 * - `structured` 直接把提示词里的 JSON 形状示例（responseExample）按目标类型解码，因此结果稳定可预期；
 * - `complete` 返回构造时给定的固定文本；默认值是高设计感纯环境参考场景（雾中海岸：水面法线贴图 + 记忆馆 10 构件 + 灯塔，
 *   源码见 [[FoggyCoastScene]]），不出现照片实体、无 DOM/网络，保证 fake 演示观感（spec 6.5 fake 固定模板）。
 */
final class FakeTextModel(completionText: String = FakeTextModel.DefaultCompletion) extends TextModel:

  override def structured[A: Decoder](prompt: StructuredPrompt): IO[A] =
    summon[Decoder[A]].decodeJson(prompt.responseExample) match
      case Right(value) => IO.pure(value)
      case Left(error) =>
        IO.raiseError(ApiException(ApiError.modelFailure(s"FakeTextModel 的 responseExample 无法解码为目标类型：${error.message}")))

  override def complete(prompt: TextPrompt): IO[String] =
    IO.pure(completionText)

object FakeTextModel:

  /** AI_MODE=fake 场景代码固定输出（雾中海岸，纯环境无照片）。 */
  val DefaultCompletion: String = FoggyCoastScene.code
