package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** 整体替换策展请求：标题、叙事与按顺序的章节（章节内照片有序）。 */
final case class UpdateCurationRequest(
  exhibitionId: ExhibitionId,
  title: String,
  narrative: String,
  groups: List[GroupInput]
)

object UpdateCurationRequest:
  given Encoder[UpdateCurationRequest] = deriveEncoder[UpdateCurationRequest]
  given Decoder[UpdateCurationRequest] = deriveDecoder[UpdateCurationRequest]
