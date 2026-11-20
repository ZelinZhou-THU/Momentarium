package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{GroupId, PhotoId}

/** 前端可见的照片视图：文件元数据 + 相对路径内容地址 + 该草稿照片已采用的讲述（v1.9）。 */
final case class PhotoView(
  id: PhotoId,
  originalName: String,
  mime: String,
  width: Int,
  height: Int,
  caption: String,
  groupId: Option[GroupId],
  positionInGroup: Option[Int],
  contentUrl: String,
  thumbUrl: String,
  memories: List[PhotoMemoryView]
)

object PhotoView:
  given Encoder[PhotoView] = deriveEncoder[PhotoView]
  given Decoder[PhotoView] = deriveDecoder[PhotoView]
