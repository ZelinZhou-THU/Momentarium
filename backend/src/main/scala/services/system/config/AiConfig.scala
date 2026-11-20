package services.system.config

import scala.concurrent.duration.*

/** AI 网关与模型角色配置；密钥只保存在内存与 .env 中。 */
final case class AiConfig(
  mode: AiMode,
  baseUrl: String,
  apiKey: Option[String],
  textModel: String,
  codeModel: String,
  visionModel: String,
  reviewModel: String,
  textProtocol: AiProtocol,
  visionProtocol: AiProtocol,
  userAgent: String,
  watchdog: FiniteDuration,
  /** 所有模型调用的推理强度（reasoning_effort）；None = 不发送。默认 max。 */
  reasoningEffort: Option[ReasoningEffort] = Some(ReasoningEffort.Max),
  /** 流式响应允许的最长无数据间隔；超过即视为连接已死，按网络失败重试。 */
  streamIdle: FiniteDuration = 5.minutes
)

object AiConfig:
  private val DefaultBaseUrl = "https://opencode.ai/inference/go"
  private val DefaultModel = "deepseek-v4.1-flash"
  private val DefaultUserAgent = "Momentarium/0.1"
  private val DefaultWatchdogMillis = 1800000L
  private val DefaultStreamIdleMillis = 300000L

  /** 未配置 = max；off = 不发送；其余按 ReasoningEffort 解析。 */
  private def reasoningEffortFrom(raw: Option[String]): Either[String, Option[ReasoningEffort]] =
    raw.map(_.trim.toLowerCase) match
      case None => Right(Some(ReasoningEffort.Max))
      case Some("off") => Right(None)
      case Some(value) => ReasoningEffort.fromString(value).map(Some(_))

  def fromEnvironment(environment: Map[String, String]): Either[String, AiConfig] =
    for
      mode <- EnvironmentVariables.string(environment, "AI_MODE", "fake").flatMap(AiMode.fromString)
      baseUrl <- EnvironmentVariables.string(environment, "AI_BASE_URL", DefaultBaseUrl)
      textModel <- EnvironmentVariables.string(environment, "AI_TEXT_MODEL", DefaultModel)
      codeModel <- EnvironmentVariables.string(environment, "AI_CODE_MODEL", DefaultModel)
      visionModel <- EnvironmentVariables.string(environment, "AI_VISION_MODEL", DefaultModel)
      reviewModel <- EnvironmentVariables.string(environment, "AI_REVIEW_MODEL", DefaultModel)
      textProtocol <- EnvironmentVariables.string(environment, "AI_TEXT_PROTOCOL", "openai").flatMap(AiProtocol.fromString)
      visionProtocol <- EnvironmentVariables.string(environment, "AI_VISION_PROTOCOL", "openai").flatMap(AiProtocol.fromString)
      userAgent <- EnvironmentVariables.string(environment, "AI_USER_AGENT", DefaultUserAgent)
      watchdogMillis <- EnvironmentVariables.long(environment, "AI_WATCHDOG_MS", DefaultWatchdogMillis)
      streamIdleMillis <- EnvironmentVariables.long(environment, "AI_STREAM_IDLE_MS", DefaultStreamIdleMillis)
      reasoningEffort <- reasoningEffortFrom(EnvironmentVariables.optional(environment, "AI_REASONING_EFFORT"))
    yield AiConfig(
      mode = mode,
      baseUrl = baseUrl,
      apiKey = EnvironmentVariables.optional(environment, "AI_API_KEY"),
      textModel = textModel,
      codeModel = codeModel,
      visionModel = visionModel,
      reviewModel = reviewModel,
      textProtocol = textProtocol,
      visionProtocol = visionProtocol,
      userAgent = userAgent,
      watchdog = FiniteDuration(watchdogMillis, "millis"),
      reasoningEffort = reasoningEffort,
      streamIdle = FiniteDuration(streamIdleMillis, "millis")
    )
