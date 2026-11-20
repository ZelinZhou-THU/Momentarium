package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.CoverKind

/** 前端可见的封面：kind 为当前封面设置，imageUrl 固定走封面字节路由。 */
final case class CoverView(kind: CoverKind, imageUrl: String, width: Int, height: Int)

object CoverView:
  given Encoder[CoverView] = deriveEncoder[CoverView]
  given Decoder[CoverView] = deriveDecoder[CoverView]
