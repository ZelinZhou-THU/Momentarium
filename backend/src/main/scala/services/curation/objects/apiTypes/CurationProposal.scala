package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.apiTypes.GroupInput

/** refinecuration 的提案：结构与 gallery 的 UpdateCuration 输入一致，用户确认后才写库。 */
final case class CurationProposal(title: String, narrative: String, groups: List[GroupInput])

object CurationProposal:
  given Encoder[CurationProposal] = deriveEncoder[CurationProposal]
  given Decoder[CurationProposal] = deriveDecoder[CurationProposal]
