package services.gallery.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{ContributionId, ContributionStatus, ExhibitionId}

/** 投稿摘要（列表即详情）：同时服务“我的回忆”与创建者审阅列表，按角色过滤；
  * adoption 非空表示已被采用，hasPendingUpdate 表示投稿版本高于已采用版本；
  * v1.10 起照片可选：纯文字投稿 file 为 null；v1.11 起始终输出可空的建议图注 suggestedCaption；
  * v1.16 起 exhibitionPublished = 展览当前有 active 发布，memoryPublished = 已采用讲述已在该发布快照里公开。 */
final case class ContributionSummary(
  id: ContributionId,
  exhibitionId: ExhibitionId,
  exhibitionTitle: String,
  contributor: ContributorBrief,
  status: ContributionStatus,
  version: Int,
  memoryText: String,
  suggestedCaption: Option[String],
  location: Option[ContributionLocationView],
  file: Option[ContributionFileView],
  adoption: Option[ContributionAdoptionView],
  hasPendingUpdate: Boolean,
  exhibitionPublished: Boolean,
  memoryPublished: Boolean,
  createdAt: Instant,
  updatedAt: Instant,
  withdrawnAt: Option[Instant]
)

object ContributionSummary:
  given Encoder[ContributionSummary] = deriveEncoder[ContributionSummary]
  given Decoder[ContributionSummary] = deriveDecoder[ContributionSummary]
