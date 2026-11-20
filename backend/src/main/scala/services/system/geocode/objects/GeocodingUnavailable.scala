package services.system.geocode.objects

/** 地理编码提供方不可用（超时、非 2xx、限流拒绝或响应无法解析）；由搜索消息映射为 503 UPSTREAM_UNAVAILABLE。 */
final case class GeocodingUnavailable(message: String) extends RuntimeException(message)
