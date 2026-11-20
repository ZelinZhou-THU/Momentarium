package services.curation.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{LocationGranularity, PhotoId}

/** curation.photo_location_candidates：一张照片当前一批 AI 地点候选（建议时整体替换旧候选）。
  * 有坐标的候选 granularity 为 area/exact；仅名称候选坐标与 granularity 均为 None。
  * model 记录产出模型，generatedAt 记录建议时间。 */
final case class LocationCandidate(
  id: LocationCandidateId,
  photoId: PhotoId,
  name: String,
  latitude: Option[Double],
  longitude: Option[Double],
  granularity: Option[LocationGranularity],
  reason: String,
  model: String,
  generatedAt: Instant
)

object LocationCandidate:
  given Encoder[LocationCandidate] = deriveEncoder[LocationCandidate]
  given Decoder[LocationCandidate] = deriveDecoder[LocationCandidate]
