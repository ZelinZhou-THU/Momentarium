package services.system.ai

import scala.concurrent.duration.*

import munit.CatsEffectSuite

import services.system.ai.objects.{ReviewPrompt, TextPrompt}
import services.scene.objects.ReviewVerdict
import services.system.config.{AiConfig, AiMode, AiProtocol}

/** AiRuntime 的装配语义：未初始化明确失败；initialize 后 fake 端口可用。 */
class AiRuntimeSpec extends CatsEffectSuite:

  private val fakeConfig = AiConfig(
    mode = AiMode.Fake,
    baseUrl = "https://opencode.ai/inference",
    apiKey = None,
    textModel = "deepseek-v4.1-flash",
    codeModel = "deepseek-v4.1-flash",
    visionModel = "deepseek-v4.1-flash",
    reviewModel = "deepseek-v4.1-flash",
    textProtocol = AiProtocol.OpenAi,
    visionProtocol = AiProtocol.OpenAi,
    userAgent = "Momentarium/0.1",
    watchdog = 30.minutes
  )

  // 全局端口状态可能被其他 suite 初始化过：先重置，再看“未初始化”语义。
  test("未初始化时取端口返回明确错误，而不是静默 fake") {
    for
      _ <- AiRuntime.reset
      result <- AiRuntime.ports.attempt
    yield assert(result.isLeft, s"未初始化必须失败，实际：$result")
  }

  test("initialize(fake) 之后端口可用且是确定性实现") {
    for
      _ <- AiRuntime.initialize(fakeConfig)
      ports <- AiRuntime.ports
      text <- ports.text.complete(TextPrompt("session-1", "写一句氛围描述"))
      review <- ports.review.review(ReviewPrompt("run-1", "评审截图", io.circe.Json.obj()), Nil)
    yield
      assert(text.nonEmpty)
      assertEquals(review.verdict, ReviewVerdict.Pass)
  }
