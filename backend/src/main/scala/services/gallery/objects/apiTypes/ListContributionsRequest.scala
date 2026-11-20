package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** listcontributions：创建者传自己的 exhibitionId 进入审阅范围；投稿者可不传（看自己的全部）。 */
final case class ListContributionsRequest(exhibitionId: Option[ExhibitionId])

object ListContributionsRequest:
  given Encoder[ListContributionsRequest] = deriveEncoder[ListContributionsRequest]
  given Decoder[ListContributionsRequest] = deriveDecoder[ListContributionsRequest]
