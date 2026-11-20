package services.gallery.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** 我的展览列表的一行；scenePalette 同 ExhibitionDetail，用于卡片配色；
  * pendingContributionCount（v1.15）= 待创建者处理的投稿数（submitted 且未采用或有更新）。 */
final case class ExhibitionSummary(
  id: ExhibitionId,
  title: String,
  photoCount: Int,
  updatedAt: Instant,
  cover: CoverView,
  sceneStale: Boolean,
  publication: Option[PublicationSummary],
  hasUnpublishedChanges: Boolean,
  pendingContributionCount: Int,
  scenePalette: List[String]
)

object ExhibitionSummary:
  given Encoder[ExhibitionSummary] = deriveEncoder[ExhibitionSummary]
  given Decoder[ExhibitionSummary] = deriveDecoder[ExhibitionSummary]
