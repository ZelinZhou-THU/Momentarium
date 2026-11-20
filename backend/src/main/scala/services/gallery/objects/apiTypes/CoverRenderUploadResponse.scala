package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 场景渲染封面上传响应：renderKey 供 setcover(kind=render) 引用。 */
final case class CoverRenderUploadResponse(renderKey: String, width: Int, height: Int)

object CoverRenderUploadResponse:
  given Encoder[CoverRenderUploadResponse] = deriveEncoder[CoverRenderUploadResponse]
  given Decoder[CoverRenderUploadResponse] = deriveDecoder[CoverRenderUploadResponse]
