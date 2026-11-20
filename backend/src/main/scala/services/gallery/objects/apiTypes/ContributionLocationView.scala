package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.LocationSource

/** 投稿位置视图（草稿/审阅）：投稿者的位置是建议，公开粒度由创建者采用时确认。 */
final case class ContributionLocationView(
  name: String,
  latitude: Option[Double],
  longitude: Option[Double],
  source: LocationSource
)

object ContributionLocationView:
  given Encoder[ContributionLocationView] = deriveEncoder[ContributionLocationView]
  given Decoder[ContributionLocationView] = deriveDecoder[ContributionLocationView]
