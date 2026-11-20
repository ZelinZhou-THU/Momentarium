package services.system.api

/** 503 UPSTREAM_UNAVAILABLE 的稳定原因码，前端按键值分支处理。 */
enum UpstreamReason:
  case PlaceSearchUnavailable

object UpstreamReason:
  def toString(reason: UpstreamReason): String =
    reason match
      case UpstreamReason.PlaceSearchUnavailable => "PLACE_SEARCH_UNAVAILABLE"
