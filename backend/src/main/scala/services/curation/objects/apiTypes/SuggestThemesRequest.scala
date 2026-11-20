package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** suggestthemes 请求体；hint 是用户对主题方向的参考（≤200 字），不改变覆盖规则。 */
final case class SuggestThemesRequest(exhibitionId: ExhibitionId, hint: Option[String])

object SuggestThemesRequest:
  given Encoder[SuggestThemesRequest] = deriveEncoder[SuggestThemesRequest]
  given Decoder[SuggestThemesRequest] = deriveDecoder[SuggestThemesRequest]
