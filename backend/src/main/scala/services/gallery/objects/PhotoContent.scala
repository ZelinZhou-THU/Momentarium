package services.gallery.objects

/** 照片内容路由的字节载荷：mimeType 用于响应 Content-Type，不参与 JSON 序列化。 */
final case class PhotoContent(bytes: Array[Byte], mimeType: String)
