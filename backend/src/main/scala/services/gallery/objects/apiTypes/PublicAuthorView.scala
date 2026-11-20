package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 公开页上的作者入口：仅当作者开启主页时出现（api-contract §2.1）。 */
final case class PublicAuthorView(username: String, displayName: String)

object PublicAuthorView:
  given Encoder[PublicAuthorView] = deriveEncoder[PublicAuthorView]
  given Decoder[PublicAuthorView] = deriveDecoder[PublicAuthorView]
