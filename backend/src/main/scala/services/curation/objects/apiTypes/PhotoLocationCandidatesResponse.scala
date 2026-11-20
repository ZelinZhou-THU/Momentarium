package services.curation.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoId

/** suggestphotolocation / getphotolocationcandidates 响应（v1.13）：无候选时 candidates=[] 且 model/generatedAt 为 null。 */
final case class PhotoLocationCandidatesResponse(
  photoId: PhotoId,
  candidates: List[PhotoLocationCandidateView],
  model: Option[String],
  generatedAt: Option[Instant]
)

object PhotoLocationCandidatesResponse:
  given Encoder[PhotoLocationCandidatesResponse] = deriveEncoder[PhotoLocationCandidatesResponse]
  given Decoder[PhotoLocationCandidatesResponse] = deriveDecoder[PhotoLocationCandidatesResponse]
