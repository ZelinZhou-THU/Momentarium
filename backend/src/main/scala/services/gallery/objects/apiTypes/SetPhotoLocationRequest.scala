package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoId

/** setphotolocation 请求（api-contract §2.2）：granularity 为线上字符串，由消息层校验后转领域枚举，
  * 以便非法粒度返回 VALIDATION(LOCATION_GRANULARITY_INVALID) 而不是 JSON 形状错误。 */
final case class SetPhotoLocationRequest(
  photoId: PhotoId,
  name: String,
  latitude: Option[Double],
  longitude: Option[Double],
  granularity: String
)

object SetPhotoLocationRequest:
  given Encoder[SetPhotoLocationRequest] = deriveEncoder[SetPhotoLocationRequest]
  given Decoder[SetPhotoLocationRequest] = deriveDecoder[SetPhotoLocationRequest]
