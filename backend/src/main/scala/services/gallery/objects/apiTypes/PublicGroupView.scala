package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.GroupId

/** 公开页章节视图。 */
final case class PublicGroupView(
  id: GroupId,
  title: String,
  narrative: String,
  position: Int,
  photos: List[PublicPhotoView]
)

object PublicGroupView:
  given Encoder[PublicGroupView] = deriveEncoder[PublicGroupView]
  given Decoder[PublicGroupView] = deriveDecoder[PublicGroupView]
