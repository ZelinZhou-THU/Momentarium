package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoId

/** 从草稿删除照片请求。 */
final case class DeletePhotoRequest(photoId: PhotoId)

object DeletePhotoRequest:
  given Encoder[DeletePhotoRequest] = deriveEncoder[DeletePhotoRequest]
  given Decoder[DeletePhotoRequest] = deriveDecoder[DeletePhotoRequest]
