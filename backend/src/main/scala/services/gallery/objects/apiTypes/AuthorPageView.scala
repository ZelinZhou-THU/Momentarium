package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** getauthorpage 响应：作者公开资料、全部已发布展览（最近发布在前）与跨展览足迹
  * （api-contract v1.8 §2.1：只聚合已发布快照的公开位置，展览按 publishedAt 倒序）。 */
final case class AuthorPageView(
  username: String,
  displayName: String,
  bio: String,
  exhibitions: List[AuthorExhibitionCard],
  journeyLocations: List[AuthorJourneyLocation]
)

object AuthorPageView:
  given Encoder[AuthorPageView] = deriveEncoder[AuthorPageView]
  given Decoder[AuthorPageView] = deriveDecoder[AuthorPageView]
