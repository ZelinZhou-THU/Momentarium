package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoId

/** 公开页照片视图（只来自 active 快照；不含原始文件名）；reading 在发布时没有分析缓存或快照早于 v0.9.8 时为 None；
  * memories 是 v1.9 冻结的已采用讲述，旧快照没有该字段时为 []。 */
final case class PublicPhotoView(
  id: PhotoId,
  width: Int,
  height: Int,
  caption: String,
  contentUrl: String,
  thumbUrl: String,
  reading: Option[PublicPhotoReading],
  memories: List[PublicPhotoMemory]
)

object PublicPhotoView:
  given Encoder[PublicPhotoView] = deriveEncoder[PublicPhotoView]
  given Decoder[PublicPhotoView] = deriveDecoder[PublicPhotoView]
