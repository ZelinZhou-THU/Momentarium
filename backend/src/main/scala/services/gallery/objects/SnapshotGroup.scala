package services.gallery.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 快照章节（冻结）：标题/叙事/顺序与照片 id 有序列表。 */
final case class SnapshotGroup(
  id: GroupId,
  title: String,
  narrative: String,
  position: Int,
  photoIds: List[PhotoId]
)

object SnapshotGroup:
  given Encoder[SnapshotGroup] = deriveEncoder[SnapshotGroup]
  given Decoder[SnapshotGroup] = deriveDecoder[SnapshotGroup]
