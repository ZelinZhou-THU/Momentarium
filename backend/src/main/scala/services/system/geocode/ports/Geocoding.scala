package services.system.geocode.ports

import cats.effect.IO

import services.system.geocode.objects.GeocodedPlace

/** 可替换的地理编码端口：只接收用户明确输入的地点名称，不接收客户端自定义上游地址。 */
trait Geocoding:
  def search(query: String): IO[List[GeocodedPlace]]
