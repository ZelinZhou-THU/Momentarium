package services.gallery.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 照片位置行（gallery.photo_locations）：一照片最多一条；无记录=未知。
  * 坐标统一 WGS84，可空但必须成对；confirmed 的 area/exact 必须有坐标。 */
final case class PhotoLocation(
  photoId: PhotoId,
  source: LocationSource,
  status: LocationStatus,
  name: String,
  latitude: Option[Double],
  longitude: Option[Double],
  granularity: LocationGranularity,
  updatedAt: Instant
)

object PhotoLocation:
  given Encoder[PhotoLocation] = deriveEncoder[PhotoLocation]
  given Decoder[PhotoLocation] = deriveDecoder[PhotoLocation]
