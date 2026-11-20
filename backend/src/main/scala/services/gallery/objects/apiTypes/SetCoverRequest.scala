package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{CoverKind, ExhibitionId, PhotoId}

/** 设置封面请求：photoId/renderKey 为 Option，按契约序列化为 null。 */
final case class SetCoverRequest(
  exhibitionId: ExhibitionId,
  kind: CoverKind,
  photoId: Option[PhotoId],
  renderKey: Option[String]
)

object SetCoverRequest:
  given Encoder[SetCoverRequest] = deriveEncoder[SetCoverRequest]
  given Decoder[SetCoverRequest] = deriveDecoder[SetCoverRequest]
