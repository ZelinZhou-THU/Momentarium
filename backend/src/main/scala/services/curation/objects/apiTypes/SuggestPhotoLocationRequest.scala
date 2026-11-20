package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoId

/** suggestphotolocation（v1.13）：作者为一张草稿照片请求 AI 地点候选（替换当前候选集）。 */
final case class SuggestPhotoLocationRequest(photoId: PhotoId)

object SuggestPhotoLocationRequest:
  given Encoder[SuggestPhotoLocationRequest] = deriveEncoder[SuggestPhotoLocationRequest]
  given Decoder[SuggestPhotoLocationRequest] = deriveDecoder[SuggestPhotoLocationRequest]
