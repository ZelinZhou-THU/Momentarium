package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** getauthorpage 请求（公开）：按用户名读取作者主页。 */
final case class GetAuthorPageRequest(username: String)

object GetAuthorPageRequest:
  given Encoder[GetAuthorPageRequest] = deriveEncoder[GetAuthorPageRequest]
  given Decoder[GetAuthorPageRequest] = deriveDecoder[GetAuthorPageRequest]
