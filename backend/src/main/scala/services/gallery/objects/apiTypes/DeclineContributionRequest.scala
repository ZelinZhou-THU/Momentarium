package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ContributionId

/** declinecontribution（v1.10）：策展人按版本不采用一条已提交且未被采用的投稿。 */
final case class DeclineContributionRequest(contributionId: ContributionId, expectedVersion: Int)

object DeclineContributionRequest:
  given Encoder[DeclineContributionRequest] = deriveEncoder[DeclineContributionRequest]
  given Decoder[DeclineContributionRequest] = deriveDecoder[DeclineContributionRequest]
