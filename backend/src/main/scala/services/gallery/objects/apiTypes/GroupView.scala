package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.GroupId

/** 草稿中的一个策展章节。 */
final case class GroupView(
  id: GroupId,
  title: String,
  narrative: String,
  position: Int,
  photos: List[PhotoView]
)

object GroupView:
  given Encoder[GroupView] = deriveEncoder[GroupView]
  given Decoder[GroupView] = deriveDecoder[GroupView]
