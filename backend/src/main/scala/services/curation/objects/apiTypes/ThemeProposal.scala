package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 一个候选主题方案（spec 10.2）：名称 ≤24 字、理念 ≤120 字、分组 1–4 且覆盖全部照片。 */
final case class ThemeProposal(name: String, concept: String, groups: List[ProposalGroup])

object ThemeProposal:
  given Encoder[ThemeProposal] = deriveEncoder[ThemeProposal]
  given Decoder[ThemeProposal] = deriveDecoder[ThemeProposal]
