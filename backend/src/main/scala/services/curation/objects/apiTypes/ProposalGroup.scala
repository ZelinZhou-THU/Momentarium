package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoId

/** 主题方案中的一个章节：标题 + 该章节的照片（只写 photoId，交给用户确认后由 gallery 写库）。 */
final case class ProposalGroup(title: String, photoIds: List[PhotoId])

object ProposalGroup:
  given Encoder[ProposalGroup] = deriveEncoder[ProposalGroup]
  given Decoder[ProposalGroup] = deriveDecoder[ProposalGroup]
