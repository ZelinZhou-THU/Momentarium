package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 上传照片响应：成功文件返回 PhotoView，失败文件只入 failures，整批仍算成功。 */
final case class UploadPhotosResponse(photos: List[PhotoView], failures: List[UploadFailure])

object UploadPhotosResponse:
  given Encoder[UploadPhotosResponse] = deriveEncoder[UploadPhotosResponse]
  given Decoder[UploadPhotosResponse] = deriveDecoder[UploadPhotosResponse]
