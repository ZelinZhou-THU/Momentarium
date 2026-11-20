package services.gallery.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** 作者主页上的一个已发布展览（只取自 active 快照；scenePalette 用于卡片配色）。 */
final case class AuthorExhibitionCard(
  id: ExhibitionId,
  title: String,
  narration: String,
  cover: CoverView,
  version: Int,
  publishedAt: Instant,
  scenePalette: List[String]
)

object AuthorExhibitionCard:
  given Encoder[AuthorExhibitionCard] = deriveEncoder[AuthorExhibitionCard]
  given Decoder[AuthorExhibitionCard] = deriveDecoder[AuthorExhibitionCard]
