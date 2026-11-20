package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 公开页照片的 AI 解读（只来自 active 快照）：画面主色、配文与感官描写。 */
final case class PublicPhotoReading(
  palette: List[String],
  poeticLine: String,
  sensory: String
)

object PublicPhotoReading:
  given Encoder[PublicPhotoReading] = deriveEncoder[PublicPhotoReading]
  given Decoder[PublicPhotoReading] = deriveDecoder[PublicPhotoReading]
