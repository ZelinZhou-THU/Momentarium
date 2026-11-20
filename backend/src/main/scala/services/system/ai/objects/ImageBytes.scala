package services.system.ai.objects

/** 送往模型的图片：原始字节 + MIME；由调用方按 spec 10.1 压缩到长边 1024 后传入。 */
final case class ImageBytes(bytes: Array[Byte], mimeType: String)
