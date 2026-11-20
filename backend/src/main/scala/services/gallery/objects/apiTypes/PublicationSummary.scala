package services.gallery.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 当前 active 发布快照摘要。 */
final case class PublicationSummary(version: Int, publishedAt: Instant)

object PublicationSummary:
  given Encoder[PublicationSummary] = deriveEncoder[PublicationSummary]
  given Decoder[PublicationSummary] = deriveDecoder[PublicationSummary]
