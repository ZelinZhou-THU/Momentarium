package services.gallery.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** gallery.exhibition_photos 行：照片文件元数据与草稿编排位置。
  * v2.7 起 `adoptedFromContributionId` 显式记录“由哪条投稿采用新建”，用于去重与撤回清理
  * （旧数据为 None，由启动回填按 created_at 时间戳推断补齐）。 */
final case class ExhibitionPhoto(
  id: PhotoId,
  exhibitionId: ExhibitionId,
  storageKey: String,
  thumbKey: String,
  originalName: String,
  mime: String,
  width: Option[Int],
  height: Option[Int],
  groupId: Option[GroupId],
  positionInGroup: Option[Int],
  caption: String,
  archivedAt: Option[Instant],
  createdAt: Instant,
  adoptedFromContributionId: Option[ContributionId] = None
)

object ExhibitionPhoto:
  given Encoder[ExhibitionPhoto] = deriveEncoder[ExhibitionPhoto]
  given Decoder[ExhibitionPhoto] = deriveDecoder[ExhibitionPhoto]
