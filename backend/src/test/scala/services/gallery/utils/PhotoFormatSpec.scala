package services.gallery.utils

import java.nio.charset.StandardCharsets

import services.gallery.objects.PhotoFormat

/** 照片格式只按文件头识别：扩展名与声明 Content-Type 不可信。 */
class PhotoFormatSpec extends munit.FunSuite:
  private val pngSignature: Array[Byte] =
    Array(0x89.toByte, 0x50.toByte, 0x4e.toByte, 0x47.toByte, 0x0d.toByte, 0x0a.toByte, 0x1a.toByte, 0x0a.toByte)

  private val webpPrefix: Array[Byte] =
    "RIFF".getBytes(StandardCharsets.US_ASCII) ++ Array(0x24, 0x00, 0x00, 0x00).map(_.toByte) ++
      "WEBP".getBytes(StandardCharsets.US_ASCII)

  test("按文件头识别 JPEG / PNG / WebP") {
    assertEquals(PhotoFormat.fromBytes(Array(0xff.toByte, 0xd8.toByte, 0xff.toByte, 0xe0.toByte)), Some(PhotoFormat.Jpeg))
    assertEquals(PhotoFormat.fromBytes(pngSignature ++ Array(0, 0, 0, 0).map(_.toByte)), Some(PhotoFormat.Png))
    assertEquals(PhotoFormat.fromBytes(webpPrefix), Some(PhotoFormat.Webp))
  }

  test("过短或文件头不符时返回 None（不信任扩展名）") {
    assertEquals(PhotoFormat.fromBytes(Array.emptyByteArray), None)
    assertEquals(PhotoFormat.fromBytes(Array(0xff.toByte, 0xd8.toByte)), None)
    assertEquals(PhotoFormat.fromBytes("RIFF-not-webp".getBytes(StandardCharsets.US_ASCII)), None)
    assertEquals(PhotoFormat.fromBytes("GIF89a".getBytes(StandardCharsets.US_ASCII)), None)
  }

  test("格式自带 mime 与存储扩展名，HEIC 等不在支持集合内") {
    assertEquals(PhotoFormat.Jpeg.mimeType, "image/jpeg")
    assertEquals(PhotoFormat.Png.mimeType, "image/png")
    assertEquals(PhotoFormat.Webp.mimeType, "image/webp")
    assertEquals(List(PhotoFormat.Jpeg, PhotoFormat.Png, PhotoFormat.Webp).map(_.fileExtension), List("jpg", "png", "webp"))
    assertEquals(PhotoFormat.fromBytes("ftypheic".getBytes(StandardCharsets.US_ASCII)), None)
  }
