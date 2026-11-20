package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 投稿文件视图：私有读取地址（仅本人/创建者可用），宽高未知时为 null。 */
final case class ContributionFileView(
  mime: String,
  width: Option[Int],
  height: Option[Int],
  contentUrl: String,
  thumbUrl: String
)

object ContributionFileView:
  given Encoder[ContributionFileView] = deriveEncoder[ContributionFileView]
  given Decoder[ContributionFileView] = deriveDecoder[ContributionFileView]
