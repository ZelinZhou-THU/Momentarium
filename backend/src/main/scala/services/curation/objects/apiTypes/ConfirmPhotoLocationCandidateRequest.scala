package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.curation.objects.LocationCandidateId
import services.gallery.objects.PhotoId

/** confirmphotolocationcandidate（v1.13）：作者选择一个候选并确认公开粒度，写入 gallery 位置。
  * granularity 用字符串接收，由消息校验后返回 LOCATION_GRANULARITY_INVALID，而不是让 JSON 解码失败。 */
final case class ConfirmPhotoLocationCandidateRequest(
  photoId: PhotoId,
  candidateId: LocationCandidateId,
  granularity: String
)

object ConfirmPhotoLocationCandidateRequest:
  given Encoder[ConfirmPhotoLocationCandidateRequest] = deriveEncoder[ConfirmPhotoLocationCandidateRequest]
  given Decoder[ConfirmPhotoLocationCandidateRequest] = deriveDecoder[ConfirmPhotoLocationCandidateRequest]
