package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** createcontribution（v1.12）：先创建带可选建议图注/位置的 draft 投稿，回忆可空；
  * 照片通过 §5.5 上传附加，带图且补全回忆后由 updatecontribution submit=true 提交审阅。 */
final case class CreateContributionRequest(
  exhibitionId: ExhibitionId,
  memoryText: String,
  suggestedCaption: Option[String],
  location: Option[ContributionLocationInput]
)

object CreateContributionRequest:
  given Encoder[CreateContributionRequest] = deriveEncoder[CreateContributionRequest]
  given Decoder[CreateContributionRequest] = deriveDecoder[CreateContributionRequest]
