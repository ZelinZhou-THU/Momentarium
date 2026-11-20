package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoId

/** 策展编排中的单张照片输入：照片 ID + 图注。 */
final case class ExhibitionPhotoInput(photoId: PhotoId, caption: String)

object ExhibitionPhotoInput:
  given Encoder[ExhibitionPhotoInput] = deriveEncoder[ExhibitionPhotoInput]
  given Decoder[ExhibitionPhotoInput] = deriveDecoder[ExhibitionPhotoInput]
