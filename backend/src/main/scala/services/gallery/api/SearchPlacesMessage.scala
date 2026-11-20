package services.gallery.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.apiTypes.{PlaceCandidate, PlaceSearchResponse}
import services.gallery.utils.PhotoLocations
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, UpstreamReason}
import services.system.geocode.GeocodingRuntime
import services.users.objects.UserId

/** 地点搜索代理（api-contract §2.2 searchplaces）：只提交用户明确输入的地点名称；
  * 提供方不可用统一映射 503 UPSTREAM_UNAVAILABLE(PLACE_SEARCH_UNAVAILABLE)，无结果返回空数组。 */
final case class SearchPlacesMessage(userId: UserId, query: String) extends APIWithTokenMessage[PlaceSearchResponse]:
  override def plan(connection: Connection): IO[PlaceSearchResponse] =
    for
      validQuery <- PhotoLocations.requireQuery(query)
      places <- GeocodingRuntime.search(validQuery).adaptError { case _ => SearchPlacesMessage.searchUnavailable }
    yield PlaceSearchResponse(
      places.map(place => PlaceCandidate(place.name, place.displayName, place.latitude, place.longitude))
    )

object SearchPlacesMessage:
  private val searchUnavailable =
    ApiException(ApiError.upstreamUnavailable(UpstreamReason.PlaceSearchUnavailable, "地点搜索暂不可用，请稍后重试"))
