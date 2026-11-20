package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ContributionId

/** withdrawcontribution：本人撤回自己的投稿；重复撤回幂等，内容路由随即 404。 */
final case class WithdrawContributionRequest(contributionId: ContributionId)

object WithdrawContributionRequest:
  given Encoder[WithdrawContributionRequest] = deriveEncoder[WithdrawContributionRequest]
  given Decoder[WithdrawContributionRequest] = deriveDecoder[WithdrawContributionRequest]
