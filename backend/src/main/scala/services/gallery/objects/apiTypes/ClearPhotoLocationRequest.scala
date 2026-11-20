package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoId

/** clearphotolocation 请求（api-contract §2.2）：删除照片位置行，无记录时幂等成功。 */
final case class ClearPhotoLocationRequest(photoId: PhotoId)

object ClearPhotoLocationRequest:
  given Encoder[ClearPhotoLocationRequest] = deriveEncoder[ClearPhotoLocationRequest]
  given Decoder[ClearPhotoLocationRequest] = deriveDecoder[ClearPhotoLocationRequest]
