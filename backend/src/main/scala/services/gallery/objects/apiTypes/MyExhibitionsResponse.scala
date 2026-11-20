package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** listmyexhibitions 的响应。 */
final case class MyExhibitionsResponse(exhibitions: List[ExhibitionSummary])

object MyExhibitionsResponse:
  given Encoder[MyExhibitionsResponse] = deriveEncoder[MyExhibitionsResponse]
  given Decoder[MyExhibitionsResponse] = deriveDecoder[MyExhibitionsResponse]
