package services.gallery.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 快照照片（冻结）：文件元数据、图注与 AI 解读，公开页按 id 读取字节。
  * reading 在 v0.9.8 加入：此前的快照没有该字段，解码为 None；发布时没有分析缓存的照片也为 None。
  * memories 在 v1.9 加入：发布时冻结的已采用讲述（含署名）；此前的快照没有该字段，解码为 None。 */
final case class SnapshotPhoto(
  id: PhotoId,
  originalName: String,
  mime: String,
  width: Int,
  height: Int,
  caption: String,
  groupId: Option[GroupId],
  positionInGroup: Option[Int],
  reading: Option[SnapshotPhotoReading],
  memories: Option[List[SnapshotMemory]] = None
)

object SnapshotPhoto:
  given Encoder[SnapshotPhoto] = deriveEncoder[SnapshotPhoto]
  given Decoder[SnapshotPhoto] = deriveDecoder[SnapshotPhoto]
