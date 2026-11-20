package services.gallery.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 发布/更新发布响应：新 active 快照的版本与时间。 */
final case class PublishExhibitionResponse(version: Int, publishedAt: Instant)

object PublishExhibitionResponse:
  given Encoder[PublishExhibitionResponse] = deriveEncoder[PublishExhibitionResponse]
  given Decoder[PublishExhibitionResponse] = deriveDecoder[PublishExhibitionResponse]
