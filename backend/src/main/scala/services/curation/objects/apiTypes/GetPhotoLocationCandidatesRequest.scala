package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoId

/** getphotolocationcandidates（v1.13）：作者读取一张照片当前 AI 地点候选（只读，不触发模型）。 */
final case class GetPhotoLocationCandidatesRequest(photoId: PhotoId)

object GetPhotoLocationCandidatesRequest:
  given Encoder[GetPhotoLocationCandidatesRequest] = deriveEncoder[GetPhotoLocationCandidatesRequest]
  given Decoder[GetPhotoLocationCandidatesRequest] = deriveDecoder[GetPhotoLocationCandidatesRequest]
