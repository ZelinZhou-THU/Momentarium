package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{LocationGranularity, PhotoId}

/** 公开地图位置（api-contract §2.1）：只含 confirmed 且 granularity 为 area/exact 的位置；
  * area 为范围代表点，不包含原始精确坐标。 */
final case class PublicPhotoLocation(
  photoId: PhotoId,
  name: String,
  granularity: LocationGranularity,
  latitude: Double,
  longitude: Double
)

object PublicPhotoLocation:
  given Encoder[PublicPhotoLocation] = deriveEncoder[PublicPhotoLocation]
  given Decoder[PublicPhotoLocation] = deriveDecoder[PublicPhotoLocation]
