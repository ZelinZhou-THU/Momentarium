package services.gallery.objects

import java.nio.charset.StandardCharsets

/** 支持的照片格式：mime 与存储扩展名由格式决定，格式只依据文件头判定（扩展名与声明类型不可信）。 */
enum PhotoFormat(val mimeType: String, val fileExtension: String):
  case Jpeg extends PhotoFormat("image/jpeg", "jpg")
  case Png extends PhotoFormat("image/png", "png")
  case Webp extends PhotoFormat("image/webp", "webp")

object PhotoFormat:
  /** 判定格式所需的前缀字节数（WebP 需要读到第 12 个字节）。 */
  val ProbeLength: Int = 12

  private val JpegMagic: Array[Byte] = Array(0xff.toByte, 0xd8.toByte, 0xff.toByte)

  private val PngMagic: Array[Byte] =
    Array(0x89.toByte, 0x50.toByte, 0x4e.toByte, 0x47.toByte, 0x0d.toByte, 0x0a.toByte, 0x1a.toByte, 0x0a.toByte)

  private val RiffMagic: Array[Byte] = "RIFF".getBytes(StandardCharsets.US_ASCII)

  private val WebpMagic: Array[Byte] = "WEBP".getBytes(StandardCharsets.US_ASCII)

  /** 只依据文件头识别格式；无法识别时返回 None。 */
  def fromBytes(prefix: Array[Byte]): Option[PhotoFormat] =
    if startsWith(prefix, 0, JpegMagic) then Some(PhotoFormat.Jpeg)
    else if startsWith(prefix, 0, PngMagic) then Some(PhotoFormat.Png)
    else if startsWith(prefix, 0, RiffMagic) && startsWith(prefix, 8, WebpMagic) then Some(PhotoFormat.Webp)
    else None

  /** 由存储 mime 反查格式（投稿行只存 mime）：未知 mime 返回 None。 */
  def fromMimeType(mimeType: String): Option[PhotoFormat] =
    values.find(_.mimeType == mimeType.trim.toLowerCase)

  private def startsWith(bytes: Array[Byte], offset: Int, expected: Array[Byte]): Boolean =
    offset + expected.length <= bytes.length && expected.indices.forall(index => bytes(offset + index) == expected(index))
