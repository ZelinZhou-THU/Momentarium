package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 创建者采用时确认的位置与公开粒度（area/exact 必须带坐标）。 */
final case class AdoptedLocationInput(
  name: String,
  latitude: Option[Double],
  longitude: Option[Double],
  granularity: String
)

object AdoptedLocationInput:
  given Encoder[AdoptedLocationInput] = deriveEncoder[AdoptedLocationInput]
  given Decoder[AdoptedLocationInput] = deriveDecoder[AdoptedLocationInput]
