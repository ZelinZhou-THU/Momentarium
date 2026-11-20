package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{ContributionId, GroupId}

/** adoptcontribution（v1.12）：创建者按版本采用投稿，只把投稿源复制为新的草稿照片；
  * 不再支持关联已有照片，`caption` 缺失/null 时继承投稿建议图注。
  * v1.15：`groupId` 可选，首次采用时把新照片放进该章节末尾；缺省/null 仍落入未分组。 */
final case class AdoptContributionRequest(
  contributionId: ContributionId,
  expectedVersion: Int,
  caption: Option[String],
  location: Option[AdoptedLocationInput],
  groupId: Option[GroupId]
)

object AdoptContributionRequest:
  given Encoder[AdoptContributionRequest] = deriveEncoder[AdoptContributionRequest]
  given Decoder[AdoptContributionRequest] = deriveDecoder[AdoptContributionRequest]
