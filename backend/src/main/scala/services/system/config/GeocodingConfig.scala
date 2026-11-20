package services.system.config

import scala.concurrent.duration.*

/** 地点搜索代理配置：提供方地址、应用标识、超时、全应用限流间隔与重复查询缓存容量。
  * 默认 fake（无网络），live 需要显式配置且调用可替换的地理编码服务。 */
final case class GeocodingConfig(
  mode: GeocodingMode,
  baseUrl: String,
  userAgent: String,
  timeout: FiniteDuration,
  minInterval: FiniteDuration,
  cacheSize: Int
)

object GeocodingConfig:
  private val DefaultBaseUrl = "https://nominatim.openstreetmap.org"
  private val DefaultUserAgent = "Momentarium/0.1 (local demo; contact: none)"
  private val DefaultTimeoutMillis = 5000L
  private val DefaultMinIntervalMillis = 1000L
  private val DefaultCacheSize = 128

  def fromEnvironment(environment: Map[String, String]): Either[String, GeocodingConfig] =
    for
      mode <- EnvironmentVariables.string(environment, "GEOCODE_MODE", "fake").flatMap(GeocodingMode.fromString)
      baseUrl <- EnvironmentVariables.string(environment, "GEOCODE_BASE_URL", DefaultBaseUrl)
      userAgent <- EnvironmentVariables.string(environment, "GEOCODE_USER_AGENT", DefaultUserAgent)
      timeoutMillis <- EnvironmentVariables.long(environment, "GEOCODE_TIMEOUT_MS", DefaultTimeoutMillis)
      minIntervalMillis <- EnvironmentVariables.long(environment, "GEOCODE_MIN_INTERVAL_MS", DefaultMinIntervalMillis)
      cacheSize <- EnvironmentVariables.int(environment, "GEOCODE_CACHE_SIZE", DefaultCacheSize)
      _ <- Either.cond(timeoutMillis > 0, (), "GEOCODE_TIMEOUT_MS 必须为正数")
      _ <- Either.cond(minIntervalMillis >= 0, (), "GEOCODE_MIN_INTERVAL_MS 不能为负数")
      _ <- Either.cond(cacheSize > 0, (), "GEOCODE_CACHE_SIZE 必须为正数")
    yield GeocodingConfig(
      mode = mode,
      baseUrl = baseUrl,
      userAgent = userAgent,
      timeout = FiniteDuration(timeoutMillis, "millis"),
      minInterval = FiniteDuration(minIntervalMillis, "millis"),
      cacheSize = cacheSize
    )
