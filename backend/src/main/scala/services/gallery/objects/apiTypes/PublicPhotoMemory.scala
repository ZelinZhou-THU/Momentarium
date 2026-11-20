package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 公开页讲述：只含正文与署名，不公开来源投稿 id / 投稿者账号。 */
final case class PublicPhotoMemory(text: String, contributorName: String)

object PublicPhotoMemory:
  given Encoder[PublicPhotoMemory] = deriveEncoder[PublicPhotoMemory]
  given Decoder[PublicPhotoMemory] = deriveDecoder[PublicPhotoMemory]
