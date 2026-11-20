package services.gallery.objects

/** 从 JPEG APP1 EXIF GPS 标签解析出的坐标（WGS84）；PNG/WebP 当前不产生建议。 */
final case class GpsCoordinates(latitude: Double, longitude: Double)
