package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 投稿者录入/EXIF 建议的位置输入：坐标为可空成对值，粒度在采用时由创建者确认。 */
final case class ContributionLocationInput(name: String, latitude: Option[Double], longitude: Option[Double])

object ContributionLocationInput:
  given Encoder[ContributionLocationInput] = deriveEncoder[ContributionLocationInput]
  given Decoder[ContributionLocationInput] = deriveDecoder[ContributionLocationInput]
