package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** getcontributionmanagement：创建者读取自己展览的邀请与参与者。 */
final case class GetContributionManagementRequest(exhibitionId: ExhibitionId)

object GetContributionManagementRequest:
  given Encoder[GetContributionManagementRequest] = deriveEncoder[GetContributionManagementRequest]
  given Decoder[GetContributionManagementRequest] = deriveDecoder[GetContributionManagementRequest]
