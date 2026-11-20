package services.gallery.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.users.objects.UserId

/** gallery.contributions：一稿 = 一段回忆 + 可选一张照片 + 一个位置建议 + 版本。
  * 阶段 2.5 起照片可选：纯文字投稿的图片列全为 NULL；文件键指向投稿专用键空间，
  * 与草稿/快照文件独立；采用时复制成草稿照片的独立文件。
  * 阶段 2.6 起带投稿者建议图注 suggestedCaption（可空，采用新照片时可作默认图注）。 */
final case class Contribution(
  id: ContributionId,
  exhibitionId: ExhibitionId,
  contributorId: UserId,
  status: ContributionStatus,
  version: Int,
  memoryText: String,
  suggestedCaption: Option[String],
  originalName: Option[String],
  mime: Option[String],
  width: Option[Int],
  height: Option[Int],
  originalKey: Option[String],
  thumbKey: Option[String],
  displayKey: Option[String],
  originalBytes: Option[Long],
  derivedBytes: Option[Long],
  locationName: String,
  latitude: Option[Double],
  longitude: Option[Double],
  locationSource: LocationSource,
  createdAt: Instant,
  updatedAt: Instant,
  withdrawnAt: Option[Instant],
  declinedAt: Option[Instant]
)

object Contribution:
  given Encoder[Contribution] = deriveEncoder[Contribution]
  given Decoder[Contribution] = deriveDecoder[Contribution]
