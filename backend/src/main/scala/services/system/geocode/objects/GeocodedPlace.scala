package services.system.geocode.objects

/** 地理编码端口的中立结果类型：gallery 再映射为自己的 PlaceCandidate 契约类型。 */
final case class GeocodedPlace(name: String, displayName: String, latitude: Double, longitude: Double)
