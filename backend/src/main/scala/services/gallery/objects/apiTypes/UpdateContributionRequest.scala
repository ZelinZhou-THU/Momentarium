package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ContributionId

/** updatecontribution（v1.10/v1.11）：保存草稿或提交审阅；可移除可选照片、修改建议图注。
  * submit=false 时保存（declined → draft，其余保持），submit=true 时进入 submitted；
  * location 为 null 表示不修改位置，版本仅在内容/照片变化时递增。 */
final case class UpdateContributionRequest(
  contributionId: ContributionId,
  memoryText: String,
  suggestedCaption: Option[String],
  location: Option[ContributionLocationInput],
  submit: Boolean,
  removePhoto: Boolean
)

object UpdateContributionRequest:
  given Encoder[UpdateContributionRequest] = deriveEncoder[UpdateContributionRequest]
  given Decoder[UpdateContributionRequest] = deriveDecoder[UpdateContributionRequest]
