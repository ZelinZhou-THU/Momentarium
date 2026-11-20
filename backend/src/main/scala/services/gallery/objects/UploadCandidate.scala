package services.gallery.objects

import java.nio.file.Path

/** multipart 上传中的单个文件：声明类型只用于一致性校验，字节已由路由流式落到临时文件。 */
final case class UploadCandidate(
  fileName: String,
  declaredContentType: Option[String],
  temporaryPath: Path
)
