package services.gallery.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** gallery.exhibition_groups 行：展览章节。 */
final case class ExhibitionGroup(
  id: GroupId,
  exhibitionId: ExhibitionId,
  title: String,
  narrative: String,
  position: Int
)

object ExhibitionGroup:
  given Encoder[ExhibitionGroup] = deriveEncoder[ExhibitionGroup]
  given Decoder[ExhibitionGroup] = deriveDecoder[ExhibitionGroup]
