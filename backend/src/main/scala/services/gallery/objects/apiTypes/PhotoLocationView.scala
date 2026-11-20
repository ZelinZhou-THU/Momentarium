package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{LocationGranularity, LocationSource, LocationStatus, PhotoId}

/** 作者草稿位置视图（api-contract §2.1）：suggested/confirmed 都返回；无记录的照片不出现在数组。 */
final case class PhotoLocationView(
  photoId: PhotoId,
  source: LocationSource,
  status: LocationStatus,
  name: String,
  latitude: Option[Double],
  longitude: Option[Double],
  granularity: LocationGranularity
)

object PhotoLocationView:
  given Encoder[PhotoLocationView] = deriveEncoder[PhotoLocationView]
  given Decoder[PhotoLocationView] = deriveDecoder[PhotoLocationView]
