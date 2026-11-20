package services.gallery.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 快照封面（冻结）：kind 与关联资源以发布时刻为准；render 封面记录存储 key 与 mime。 */
final case class SnapshotCover(
  kind: CoverKind,
  photoId: Option[PhotoId],
  renderKey: Option[String],
  storageKey: Option[String],
  mime: Option[String],
  width: Int,
  height: Int
)

object SnapshotCover:
  given Encoder[SnapshotCover] = deriveEncoder[SnapshotCover]
  given Decoder[SnapshotCover] = deriveDecoder[SnapshotCover]
