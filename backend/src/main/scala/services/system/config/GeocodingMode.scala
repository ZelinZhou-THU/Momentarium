package services.system.config

/** 地点搜索提供方模式：fake 为确定性本地实现（默认，无网络）；live 调用配置的地理编码服务。 */
enum GeocodingMode:
  case Fake
  case Live

object GeocodingMode:
  def toString(mode: GeocodingMode): String =
    mode match
      case GeocodingMode.Fake => "fake"
      case GeocodingMode.Live => "live"

  def fromString(value: String): Either[String, GeocodingMode] =
    value.trim.toLowerCase match
      case "fake" => Right(GeocodingMode.Fake)
      case "live" => Right(GeocodingMode.Live)
      case other => Left(s"不支持的 GEOCODE_MODE 值: $other")
