package services.system.geocode.fake

import cats.effect.IO

import services.system.geocode.objects.{GeocodedPlace, GeocodingUnavailable}
import services.system.geocode.ports.Geocoding

/** 确定性地理编码实现（默认 fake，无网络）：
  *   - query 含“无结果”/“no-result” → 空数组（演示与测试无结果路径）；
  *   - query 含“不可用”/“unavailable” → GeocodingUnavailable（演示与测试 503 路径）；
  *   - 其余 → 由 query 派生的两条候选，便于本地演示搜索结果。
  */
final case class FakeGeocoding() extends Geocoding:
  override def search(query: String): IO[List[GeocodedPlace]] =
    val normalized = query.trim
    val lowered = normalized.toLowerCase
    if lowered.contains("不可用") || lowered.contains("unavailable") then
      IO.raiseError(GeocodingUnavailable("fake 地理编码提供方不可用"))
    else if lowered.contains("无结果") || lowered.contains("no-result") then IO.pure(Nil)
    else
      IO.pure(
        List(
          GeocodedPlace(normalized, s"$normalized, 测试地点", 33.4592, 126.936),
          GeocodedPlace("测试地点", s"$normalized 附近的测试地点", 33.4996, 126.5312)
        )
      )
