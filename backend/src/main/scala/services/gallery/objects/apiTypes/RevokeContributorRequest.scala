package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId
import services.users.objects.UserId

/** revokecontributor：创建者撤销某参与者的参与关系（终态，不影响已采用副本）。 */
final case class RevokeContributorRequest(exhibitionId: ExhibitionId, contributorId: UserId)

object RevokeContributorRequest:
  given Encoder[RevokeContributorRequest] = deriveEncoder[RevokeContributorRequest]
  given Decoder[RevokeContributorRequest] = deriveDecoder[RevokeContributorRequest]
