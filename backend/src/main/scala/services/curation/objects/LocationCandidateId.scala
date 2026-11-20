package services.curation.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}

/** photo_location_candidates 主键。 */
final case class LocationCandidateId(value: UUID)

object LocationCandidateId:
  given Encoder[LocationCandidateId] = Encoder.encodeUUID.contramap(_.value)
  given Decoder[LocationCandidateId] = Decoder.decodeUUID.map(LocationCandidateId.apply)
