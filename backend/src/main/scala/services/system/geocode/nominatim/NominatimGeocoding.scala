package services.system.geocode.nominatim

import java.net.{URI, URLEncoder}
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import java.nio.charset.StandardCharsets
import java.time.Duration

import cats.effect.IO
import io.circe.Json
import io.circe.parser.parse
import scala.util.Try

import services.system.geocode.objects.{GeocodedPlace, GeocodingUnavailable}
import services.system.geocode.ports.Geocoding

/** 兼容 Nominatim 的 HTTP 地理编码实现：仅在 GEOCODE_MODE=live 时装配；测试与默认 fake 不触网。
  *
  * 只提交用户明确输入的 query；固定应用标识 UA；超时/非 2xx/解析失败统一映射为 GeocodingUnavailable。
  */
final case class NominatimGeocoding(baseUrl: String, userAgent: String, timeoutMillis: Long) extends Geocoding:
  private val client: HttpClient =
    HttpClient.newBuilder().connectTimeout(Duration.ofMillis(timeoutMillis)).build()

  override def search(query: String): IO[List[GeocodedPlace]] =
    IO.blocking(fetch(query)).flatMap(IO.fromEither)

  private def fetch(query: String): Either[GeocodingUnavailable, List[GeocodedPlace]] =
    val uri = URI.create(
      s"${baseUrl.stripSuffix("/")}/search?format=jsonv2&limit=5&accept-language=zh-CN&q=${encode(query)}"
    )
    val request = HttpRequest
      .newBuilder(uri)
      .timeout(Duration.ofMillis(timeoutMillis))
      .header("User-Agent", userAgent)
      .header("Accept", "application/json")
      .GET()
      .build()
    for
      response <- Try(client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))).toEither.left
        .map(error => GeocodingUnavailable(s"地点搜索请求失败: ${error.getClass.getSimpleName}"))
      body <- Either.cond(
        response.statusCode() == 200,
        response.body(),
        GeocodingUnavailable(s"地点搜索提供方返回 ${response.statusCode()}")
      )
      json <- parse(body).left.map(error => GeocodingUnavailable(s"地点搜索结果无法解析: ${error.message}"))
    yield json.asArray.toList.flatten.flatMap(placeOf)

  private def placeOf(json: Json): Option[GeocodedPlace] =
    for
      displayName <- json.hcursor.get[String]("display_name").toOption
      name <- json.hcursor.get[String]("name").toOption.filter(_.trim.nonEmpty).orElse(Some(displayName))
      latitude <- json.hcursor.get[String]("lat").toOption.flatMap(_.toDoubleOption)
      longitude <- json.hcursor.get[String]("lon").toOption.flatMap(_.toDoubleOption)
    yield GeocodedPlace(name, displayName, latitude, longitude)

  private def encode(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8)
