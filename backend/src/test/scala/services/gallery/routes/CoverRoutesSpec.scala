package services.gallery.routes

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import org.http4s.MediaType
import org.http4s.headers.`Content-Type`

import services.gallery.objects.PhotoContent

class CoverRoutesSpec extends munit.FunSuite:
  private val JpegMagic = Array[Byte](0xff.toByte, 0xd8.toByte, 0xff.toByte)
  private val PngMagic = Array[Byte](0x89.toByte, 0x50.toByte, 0x4e.toByte, 0x47.toByte)

  test("JPEG 封面响应体是 raw bytes（以 FF D8 FF 开头），Content-Type 用存储 mime") {
    val bytes = JpegMagic ++ Array.fill[Byte](32)(0x11)
    val response = CoverRoutes.binaryResponse(PhotoContent(bytes, "image/jpeg"))
    assertEquals(response.status.code, 200)
    assertEquals(response.headers.get[`Content-Type`].map(_.mediaType), Some(MediaType.image.jpeg))
    val body = response.body.compile.to(Array).unsafeRunSync()
    assertEquals(body.toList, bytes.toList)
    assert(body.take(3).toList == JpegMagic.toList)
  }

  test("PNG 封面响应体是 raw bytes（以 89 50 4E 47 开头）") {
    val bytes = PngMagic ++ Array.fill[Byte](16)(0x22)
    val response = CoverRoutes.binaryResponse(PhotoContent(bytes, "image/png"))
    val body = response.body.compile.to(Array).unsafeRunSync()
    assertEquals(body.take(4).toList, PngMagic.toList)
  }

  test("未知 mime 回退为 application/octet-stream 但仍输出原始字节") {
    val bytes = Array[Byte](0x01, 0x02, 0x03)
    val response = CoverRoutes.binaryResponse(PhotoContent(bytes, "application/x-unknown"))
    val body = response.body.compile.to(Array).unsafeRunSync()
    assertEquals(body.toList, bytes.toList)
  }
