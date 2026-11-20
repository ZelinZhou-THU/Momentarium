package services.gallery.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** 公开展览视图（api-contract §2.1）：只包含 active 快照内容，草稿不可见；author 仅在作者开启主页时非空；
  * scenePalette 是快照绑定场景的主色，用于界面配色（快照早于 v0.9.8 时为空列表）；
  * locations 只含 active 快照中 confirmed 且公开的位置（旧快照没有该字段时为空数组）。 */
final case class PublicExhibitionView(
  id: ExhibitionId,
  version: Int,
  title: String,
  narrative: String,
  narration: String,
  cover: CoverView,
  groups: List[PublicGroupView],
  photos: List[PublicPhotoView],
  publishedAt: Instant,
  author: Option[PublicAuthorView],
  scenePalette: List[String],
  locations: List[PublicPhotoLocation] = Nil
)

object PublicExhibitionView:
  given Encoder[PublicExhibitionView] = deriveEncoder[PublicExhibitionView]
  given Decoder[PublicExhibitionView] = deriveDecoder[PublicExhibitionView]
