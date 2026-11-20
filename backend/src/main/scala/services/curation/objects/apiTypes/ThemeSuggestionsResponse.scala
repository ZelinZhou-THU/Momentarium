package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** suggestthemes 的响应：2–3 个候选主题方案。 */
final case class ThemeSuggestionsResponse(proposals: List[ThemeProposal])

object ThemeSuggestionsResponse:
  given Encoder[ThemeSuggestionsResponse] = deriveEncoder[ThemeSuggestionsResponse]
  given Decoder[ThemeSuggestionsResponse] = deriveDecoder[ThemeSuggestionsResponse]
