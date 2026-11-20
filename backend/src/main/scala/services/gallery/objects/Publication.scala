package services.gallery.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** gallery.publications 行：不可变发布快照；同一展览最多一个 active。 */
final case class Publication(
  id: PublicationId,
  exhibitionId: ExhibitionId,
  version: Int,
  snapshot: PublicationSnapshot,
  status: PublicationStatus,
  createdAt: Instant,
  supersededAt: Option[Instant]
)

object Publication:
  given Encoder[Publication] = deriveEncoder[Publication]
  given Decoder[Publication] = deriveDecoder[Publication]
