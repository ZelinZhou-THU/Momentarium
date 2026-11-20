package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.curation.objects.LocationCandidateId
import services.gallery.objects.LocationGranularity

/** 地点候选视图（v1.13）：有坐标的候选带 area/exact；仅名称候选 latitude/longitude/granularity 全为 null。 */
final case class PhotoLocationCandidateView(
  id: LocationCandidateId,
  name: String,
  latitude: Option[Double],
  longitude: Option[Double],
  granularity: Option[LocationGranularity],
  reason: String
)

object PhotoLocationCandidateView:
  given Encoder[PhotoLocationCandidateView] = deriveEncoder[PhotoLocationCandidateView]
  given Decoder[PhotoLocationCandidateView] = deriveDecoder[PhotoLocationCandidateView]
