package services.system.ai.openai

import java.net.URI

import cats.effect.IO
import io.circe.{Decoder, Json}
import org.slf4j.{Logger, LoggerFactory}

import scala.concurrent.duration.*

import services.curation.objects.PhotoAnalysis
import services.scene.objects.SceneReview
import services.system.ai.objects.{
  ImageBytes,
  LocationCandidateDrafts,
  LocationCandidatePrompt,
  PhotoAnalysisPrompt,
  ReviewPrompt,
  StructuredPrompt,
  TextPrompt
}
import services.system.ai.ports.{LocationModel, ReviewModel, TextModel, VisionModel}
import services.system.api.{ApiError, ApiException}
import services.system.config.{AiConfig, ReasoningEffort}

/**
 * OpenAI Chat Completions 适配器：同时承载 TextModel / VisionModel / ReviewModel 三个端口（spec 6.5）。
 *
 * - 认证与识别：Bearer + 自定义 User-Agent + 稳定 x-opencode-session（由每个 prompt 的 sessionId 提供）。
 * - 超时：每次 HTTP 请求带 AI_WATCHDOG_MS；超时即失败，不重试。
 * - 流式：所有调用都走 SSE（stream=true），连接上持续有数据，不会被链路按“空闲”清掉
 *   （10-30 场景代码先改；11-01 题面请求三次在约 95–150 秒收不到响应头而断开，结构化调用也改为流式）；
 *   超过 AI_STREAM_IDLE_MS 无数据、或没收到结束标记就断开，都按网络失败重试。
 * - 429/5xx：指数退避 1s → 2s，最多 2 次重试。
 * - 结构化输出：优先 response_format=json_object；输出无法解析时带上失败原因再试一次
 *   （仅当网关拒绝 JSON 模式（HTTP 400）时重试才改为提示词约束）；仍失败按 MODEL_FAILURE 走 IO 错误通道。
 * - 日志只记模型、耗时、usage 与 x-opencode-log-id；结构化解析失败时额外记模型输出摘录，不记提示词内容、不记密钥。
 */
final class OpenAiChatClient private (
  config: AiConfig,
  apiKey: String,
  transport: OpenAiHttpTransport,
  logger: Logger
) extends TextModel with VisionModel with LocationModel with ReviewModel:

  private val endpoint: URI = URI.create(s"${config.baseUrl.replaceAll("/+$", "")}/openai/v1/chat/completions")
  private val maxHttpRetries: Int = 2
  private val RawOutputExcerptLimit: Int = 2000

  // ---------- TextModel ----------

  override def complete(prompt: TextPrompt): IO[String] =
    chat(
      config.codeModel,
      prompt.sessionId,
      "text-complete",
      OpenAiWire.textMessages(prompt),
      jsonMode = false,
      prompt.temperature,
      stream = true
    ).flatMap {
      case Right(completion) => IO.pure(completion.content)
      case Left(error) => IO.raiseError(failureOf("text-complete", error))
    }

  override def structured[A: Decoder](prompt: StructuredPrompt): IO[A] =
    structuredChat(
      purpose = "text-structured",
      model = config.textModel,
      sessionId = prompt.sessionId,
      messages = OpenAiWire.structuredMessages(prompt),
      temperature = prompt.temperature
    )

  // ---------- VisionModel ----------

  override def analyze(image: ImageBytes, prompt: PhotoAnalysisPrompt): IO[PhotoAnalysis] =
    structuredChat(
      purpose = "photo-analysis",
      model = config.visionModel,
      sessionId = prompt.sessionId,
      messages = OpenAiWire.photoAnalysisMessages(prompt, image),
      temperature = prompt.temperature
    )

  // ---------- ReviewModel ----------

  override def review(prompt: ReviewPrompt, captures: List[ImageBytes]): IO[SceneReview] =
    structuredChat(
      purpose = "scene-review",
      model = config.reviewModel,
      sessionId = prompt.sessionId,
      messages = OpenAiWire.reviewMessages(prompt, captures),
      temperature = prompt.temperature
    )

  // ---------- LocationModel ----------

  override def suggestCandidates(
    image: ImageBytes,
    prompt: LocationCandidatePrompt
  ): IO[LocationCandidateDrafts] =
    structuredChat(
      purpose = "photo-location",
      model = config.visionModel,
      sessionId = prompt.sessionId,
      messages = OpenAiWire.locationMessages(prompt, image),
      temperature = prompt.temperature
    )

  // ---------- 结构化输出与降级 ----------

  private def structuredChat[A: Decoder](
    purpose: String,
    model: String,
    sessionId: String,
    messages: List[Json],
    temperature: Option[Double]
  ): IO[A] =
    // Left((原因, JSON 模式是否仍可用))：只有网关明确拒绝 response_format 时才在重试中关闭 JSON 模式。
    val firstAttempt: IO[Either[(String, Boolean), A]] =
      chat(model, sessionId, purpose, messages, jsonMode = true, temperature, stream = true).flatMap {
        case Right(completion) =>
          IO.pure(decodeLogged[A](purpose, model, "首次", completion).left.map(reason => (reason, true)))
        case Left(ChatCallError(Some(400), reason)) =>
          logger.warn(s"JSON 模式被拒绝，降级为提示词约束 JSON：purpose=$purpose model=$model reason=$reason")
          IO.pure(Left((s"response_format 被拒绝：$reason", false)))
        case Left(error) =>
          IO.raiseError(failureOf(purpose, error))
      }

    firstAttempt.flatMap {
      case Right(value) => IO.pure(value)
      case Left((firstReason, jsonMode)) =>
        logger.warn(s"结构化输出解析失败，带失败原因重试一次：purpose=$purpose model=$model jsonMode=$jsonMode reason=$firstReason")
        chat(model, sessionId, purpose, messages :+ OpenAiWire.jsonOnlyInstruction(firstReason), jsonMode, temperature, stream = true).flatMap {
          case Right(completion) =>
            IO.fromEither(
              decodeLogged[A](purpose, model, "重试", completion)
                .left
                .map(reason => ApiException(ApiError.modelFailure(s"模型输出无法解析为结构化结果（$purpose）：$reason")))
            )
          case Left(error) => IO.raiseError(failureOf(purpose, error))
        }
    }

  /** 解码失败时把模型原文摘录写进日志，事后能看到模型实际输出了什么（只记输出，不记提示词）。 */
  private def decodeLogged[A: Decoder](purpose: String, model: String, label: String, completion: OpenAiWire.Completion): Either[String, A] =
    val decoded = OpenAiWire.decodeStructured[A](completion.content)
    decoded.left.foreach(reason =>
      logger.warn(
        s"结构化输出原文摘录（$label）：purpose=$purpose model=$model finish=${completion.finishReason.getOrElse("-")} " +
          s"reason=$reason content=${OpenAiWire.errorExcerpt(completion.content, RawOutputExcerptLimit)}"
      )
    )
    decoded

  // ---------- HTTP 调用与重试 ----------

  private def chat(
    model: String,
    sessionId: String,
    purpose: String,
    messages: List[Json],
    jsonMode: Boolean,
    temperature: Option[Double],
    stream: Boolean = false
  ): IO[Either[ChatCallError, OpenAiWire.Completion]] =
    val headers = Map(
      "Authorization" -> s"Bearer $apiKey",
      "User-Agent" -> config.userAgent,
      "x-opencode-session" -> sessionId
    )
    val body = OpenAiWire.requestBody(model, messages, jsonMode, temperature, config.reasoningEffort.map(ReasoningEffort.toString), stream).noSpaces
    attempt(model, sessionId, purpose, headers, body, stream, retriesLeft = maxHttpRetries)

  private def attempt(
    model: String,
    sessionId: String,
    purpose: String,
    headers: Map[String, String],
    body: String,
    stream: Boolean,
    retriesLeft: Int
  ): IO[Either[ChatCallError, OpenAiWire.Completion]] =
    IO.monotonic.flatMap { startedAt =>
      send(headers, body, stream).flatMap { outcome =>
        IO.monotonic.flatMap { finishedAt =>
          val elapsedMs = (finishedAt - startedAt).toMillis
          outcome match
            case Left(ChatFailure.Timeout) =>
              logger.error(
                s"模型调用超时：model=$model session=$sessionId purpose=$purpose elapsedMs=$elapsedMs watchdogMs=${config.watchdog.toMillis}"
              )
              IO.pure(Left(ChatCallError(None, s"单次调用超过 AI_WATCHDOG_MS=${config.watchdog.toMillis}ms")))
            case Left(ChatFailure.Network(detail)) =>
              retryOrFail(model, sessionId, purpose, headers, body, stream, retriesLeft, detail, elapsedMs)
            case Right(response) if response.status == 200 =>
              completionOf(response.body, stream) match
                case Right(completion) =>
                  logSuccess(model, sessionId, purpose, completion, response.logId, elapsedMs, stream)
                  IO.pure(Right(completion))
                case Left(OpenAiWire.StreamError.Truncated(chars)) =>
                  retryOrFail(
                    model, sessionId, purpose, headers, body, stream, retriesLeft,
                    s"流式响应在结束标记前断开（已收到 $chars 个字符）", elapsedMs
                  )
                case Left(OpenAiWire.StreamError.Invalid(reason)) =>
                  logger.error(
                    s"模型响应无法解析：model=$model session=$sessionId purpose=$purpose logId=${logIdOf(response)} detail=$reason"
                  )
                  IO.pure(Left(ChatCallError(Some(200), reason)))
            case Right(response) =>
              val retryable = response.status == 429 || response.status >= 500
              if retryable && retriesLeft > 0 then
                logger.warn(
                  s"模型网关要求重试：status=${response.status} retriesLeft=$retriesLeft model=$model session=$sessionId purpose=$purpose logId=${logIdOf(response)}"
                )
                IO.sleep(backoff(maxHttpRetries - retriesLeft + 1)) *>
                  attempt(model, sessionId, purpose, headers, body, stream, retriesLeft - 1)
              else
                logger.error(
                  s"模型调用失败：status=${response.status} model=$model session=$sessionId purpose=$purpose logId=${logIdOf(response)} body=${OpenAiWire.errorExcerpt(response.body, 600)}"
                )
                IO.pure(Left(ChatCallError(Some(response.status), s"HTTP ${response.status}")))
        }
      }
    }

  private def retryOrFail(
    model: String,
    sessionId: String,
    purpose: String,
    headers: Map[String, String],
    body: String,
    stream: Boolean,
    retriesLeft: Int,
    detail: String,
    elapsedMs: Long
  ): IO[Either[ChatCallError, OpenAiWire.Completion]] =
    if retriesLeft > 0 then
      logger.warn(
        s"模型调用网络失败，退避后重试：retriesLeft=$retriesLeft model=$model session=$sessionId purpose=$purpose elapsedMs=$elapsedMs detail=$detail"
      )
      IO.sleep(backoff(maxHttpRetries - retriesLeft + 1)) *>
        attempt(model, sessionId, purpose, headers, body, stream, retriesLeft - 1)
    else
      logger.error(s"模型调用网络失败且重试已用尽：model=$model session=$sessionId purpose=$purpose detail=$detail")
      IO.pure(Left(ChatCallError(None, detail)))

  private def send(headers: Map[String, String], body: String, stream: Boolean): IO[Either[ChatFailure, ChatHttpResponse]] =
    if stream then transport.postChatStream(endpoint, headers, body, config.watchdog, config.streamIdle)
    else transport.postChat(endpoint, headers, body, config.watchdog)

  private def completionOf(rawBody: String, stream: Boolean): Either[OpenAiWire.StreamError, OpenAiWire.Completion] =
    if stream then OpenAiWire.streamCompletion(rawBody)
    else OpenAiWire.completion(rawBody).left.map(OpenAiWire.StreamError.Invalid(_))

  private def backoff(retryNumber: Int): FiniteDuration =
    1.second * math.pow(2, retryNumber - 1).toLong

  private def logIdOf(response: ChatHttpResponse): String =
    response.logId.getOrElse("-")

  private def logSuccess(
    model: String,
    sessionId: String,
    purpose: String,
    completion: OpenAiWire.Completion,
    logId: Option[String],
    elapsedMs: Long,
    stream: Boolean
  ): Unit =
    val usage = OpenAiWire.usageSummary(completion.usage)
    logger.info(
      s"模型调用成功：model=${completion.model.getOrElse(model)} session=$sessionId purpose=$purpose stream=$stream elapsedMs=$elapsedMs " +
        s"finish=${completion.finishReason.getOrElse("-")} cost=${usage.cost.map(_.toString).getOrElse("-")} " +
        s"billingSource=${usage.billingSource.getOrElse("-")} listCost=${usage.listCost.map(_.toString).getOrElse("-")} " +
        s"tokensIn=${usage.inputTokens.map(_.toString).getOrElse("-")} tokensOut=${usage.outputTokens.map(_.toString).getOrElse("-")} " +
        s"reasoning=${usage.reasoningTokens.map(_.toString).getOrElse("-")} logId=${logId.getOrElse("-")}"
    )
    if completion.finishReason.contains("length") then
      logger.warn(s"模型输出因长度上限被截断（finish=length），内容可能不完整：model=$model session=$sessionId purpose=$purpose logId=${logId.getOrElse("-")}")

  private def failureOf(purpose: String, error: ChatCallError): ApiException =
    error.status match
      case Some(status) => ApiException(ApiError.modelFailure(s"模型服务返回 HTTP $status（$purpose）"))
      case None => ApiException(ApiError.modelFailure(s"模型服务不可用（$purpose）"))

object OpenAiChatClient:
  /** 测试用：注入指向本地假网关的传输层。 */
  private[ai] def using(config: AiConfig, apiKey: String, transport: OpenAiHttpTransport): OpenAiChatClient =
    new OpenAiChatClient(config, apiKey, transport, LoggerFactory.getLogger(classOf[OpenAiChatClient]))

  def live(config: AiConfig, apiKey: String): OpenAiChatClient =
    new OpenAiChatClient(config, apiKey, OpenAiHttpTransport.create(), LoggerFactory.getLogger(classOf[OpenAiChatClient]))
