package services.gallery.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 发布快照中的公开位置（冻结）：只含 confirmed 且 granularity != hidden 的位置；
  * area 存作者确认的范围代表点，exact 存精确点。 */
final case class SnapshotLocation(
  photoId: PhotoId,
  name: String,
  latitude: Double,
  longitude: Double,
  granularity: LocationGranularity
)

object SnapshotLocation:
  given Encoder[SnapshotLocation] = deriveEncoder[SnapshotLocation]
  given Decoder[SnapshotLocation] = deriveDecoder[SnapshotLocation]
