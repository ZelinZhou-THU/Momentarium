package services.gallery.utils

import java.awt.Color
import java.awt.Graphics2D
import java.awt.image.BufferedImage
import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.nio.file.{Files, Paths}
import javax.imageio.ImageIO

import cats.effect.unsafe.IORuntime

import services.gallery.objects.PhotoFormat

/** 缩略图长边、JPEG 输出与 EXIF Orientation（1–8，含镜像组合）方向纠正，以及去元数据展示副本。 */
class PhotoThumbnailsSpec extends munit.FunSuite:
  private given IORuntime = IORuntime.global

  private val orientationCases = List(
    (1, List("RED", "GREEN", "BLUE", "WHITE"), 1200, 800),
    (2, List("GREEN", "RED", "WHITE", "BLUE"), 1200, 800),
    (3, List("WHITE", "BLUE", "GREEN", "RED"), 1200, 800),
    (4, List("BLUE", "WHITE", "RED", "GREEN"), 1200, 800),
    (5, List("RED", "BLUE", "GREEN", "WHITE"), 800, 1200),
    (6, List("BLUE", "RED", "WHITE", "GREEN"), 800, 1200),
    (7, List("WHITE", "GREEN", "BLUE", "RED"), 800, 1200),
    (8, List("GREEN", "WHITE", "RED", "BLUE"), 800, 1200)
  )

  test("长边超过 480 的照片缩略图长边为 480 且保持宽高比") {
    val processed = processOrFail(jpegBytes(quadrantImage(1200, 800)))
    assertEquals(processed.width, 1200)
    assertEquals(processed.height, 800)
    val thumbnail = readImage(processed.thumbnailJpeg)
    assertEquals(math.max(thumbnail.getWidth, thumbnail.getHeight), 480)
    assertEquals((thumbnail.getWidth, thumbnail.getHeight), (480, 320))
  }

  test("小于 480 的照片不放大") {
    val processed = processOrFail(jpegBytes(quadrantImage(320, 240)))
    val thumbnail = readImage(processed.thumbnailJpeg)
    assertEquals((thumbnail.getWidth, thumbnail.getHeight), (320, 240))
  }

  test("EXIF Orientation 1–8：纠正后宽高与四角颜色符合标准方向") {
    orientationCases.foreach { case (orientation, expectedCorners, expectedWidth, expectedHeight) =>
      val encoded = if orientation == 1 then jpegBytes(quadrantImage(1200, 800)) else injectOrientation(jpegBytes(quadrantImage(1200, 800)), orientation)
      assertEquals(PhotoThumbnails.exifOrientation(encoded), orientation, s"Orientation=$orientation 解析失败")
      val processed = processOrFail(encoded)
      assertEquals((processed.width, processed.height), (expectedWidth, expectedHeight), s"Orientation=$orientation 宽高")
      val thumbnail = readImage(processed.thumbnailJpeg)
      assertEquals(math.max(thumbnail.getWidth, thumbnail.getHeight), 480, s"Orientation=$orientation 缩略图长边")
      val actualCorners = List(
        colorAt(thumbnail, 0, 0),
        colorAt(thumbnail, 1, 0),
        colorAt(thumbnail, 0, 1),
        colorAt(thumbnail, 1, 1)
      )
      assertEquals(actualCorners, expectedCorners, s"Orientation=$orientation 四角方向")
    }
  }

  test("大端 EXIF（MM）与手机/相机常见小端（II）都能解析") {
    val littleEndian = injectOrientation(jpegBytes(quadrantImage(1200, 800)), 8, bigEndian = false)
    val bigEndian = injectOrientation(jpegBytes(quadrantImage(1200, 800)), 8, bigEndian = true)
    assertEquals(PhotoThumbnails.exifOrientation(littleEndian), 8)
    assertEquals(PhotoThumbnails.exifOrientation(bigEndian), 8)
    assertEquals(processOrFail(littleEndian).width, 800)
    assertEquals(processOrFail(bigEndian).width, 800)
  }

  test("无 EXIF 的 JPEG 按正常方向处理；非法或不可解码的字节返回 None") {
    assertEquals(PhotoThumbnails.exifOrientation(jpegBytes(quadrantImage(200, 100))), 1)
    assertEquals(PhotoThumbnails.process("not an image".getBytes).unsafeRunSync(), None)
    assertEquals(PhotoThumbnails.process(Array.emptyByteArray).unsafeRunSync(), None)
  }

  test("展示副本：全尺寸、方向纠正、无 EXIF/GPS 元数据") {
    val source = ExifJpegs.withGpsExif(ExifJpegs.jpeg(ExifJpegs.quadrants(1200, 800)), 6)
    val processed = processOrFail(source)
    assertEquals((processed.width, processed.height), (800, 1200))
    assertEquals(ExifJpegs.dimensions(processed.displayJpeg), (800, 1200))
    assertEquals(ExifJpegs.corners(processed.displayJpeg), List("BLUE", "RED", "WHITE", "GREEN"))
    assert(!ExifJpegs.hasExif(processed.displayJpeg), "展示副本不得携带 EXIF")
  }

  test("render 封面重编码：JPEG 去 EXIF 且方向纠正，PNG 保持格式且无元数据") {
    val jpegSource = ExifJpegs.withGpsExif(ExifJpegs.jpeg(ExifJpegs.quadrants(1200, 800)), 6)
    val jpeg = PhotoThumbnails.sanitize(jpegSource, PhotoFormat.Jpeg).unsafeRunSync().getOrElse(fail("JPEG 重编码失败"))
    assertEquals(jpeg.mimeType, "image/jpeg")
    assertEquals((jpeg.width, jpeg.height), (800, 1200))
    assertEquals(ExifJpegs.corners(jpeg.bytes), List("BLUE", "RED", "WHITE", "GREEN"))
    assert(!ExifJpegs.hasExif(jpeg.bytes), "render 封面不得携带 EXIF")

    val pngSource = pngBytes(ExifJpegs.quadrants(320, 240))
    val png = PhotoThumbnails.sanitize(pngSource, PhotoFormat.Png).unsafeRunSync().getOrElse(fail("PNG 重编码失败"))
    assertEquals(png.mimeType, "image/png")
    assertEquals((png.width, png.height), (320, 240))
    assertEquals(PhotoFormat.fromBytes(png.bytes), Some(PhotoFormat.Png))
    assert(!ExifJpegs.hasExif(png.bytes), "PNG render 封面不得携带 EXIF")
  }

  test("hasMetadata：原生含 GPS EXIF 的 JPEG 为 true，展示副本与重编码 render 为 false") {
    val source = ExifJpegs.withGpsExif(ExifJpegs.jpeg(ExifJpegs.quadrants(320, 240)), 6)
    assert(PhotoThumbnails.hasMetadata(source), "带 GPS EXIF 的原图应判定为有元数据")
    assert(!PhotoThumbnails.hasMetadata(processOrFail(source).displayJpeg), "展示副本不得再判定为有元数据")
    val sanitized = PhotoThumbnails.sanitize(source, PhotoFormat.Jpeg).unsafeRunSync().getOrElse(fail("JPEG 重编码失败"))
    assert(!PhotoThumbnails.hasMetadata(sanitized.bytes), "重编码 render 封面不得再判定为有元数据")
    assert(!PhotoThumbnails.hasMetadata(pngBytes(ExifJpegs.quadrants(20, 20))), "无文本块的 PNG 不含元数据")
  }

  test("EXIF GPS：解析 JPEG APP1 经纬度（含南纬/西经），无 GPS/PNG/WebP 返回 None") {
    val northEast = ExifJpegs.withGpsExif(ExifJpegs.jpeg(ExifJpegs.quadrants(120, 80)), 6)
    val gps = PhotoThumbnails.exifGps(northEast).getOrElse(fail("未解析出 GPS 坐标"))
    assertEqualsDouble(gps.latitude, 37.55, 1e-9)
    assertEqualsDouble(gps.longitude, 126.0 + 58.0 / 60.0, 1e-9)

    val southWest = ExifJpegs.withGpsExif(
      ExifJpegs.jpeg(ExifJpegs.quadrants(120, 80)),
      6,
      latitudeRef = 'S',
      longitudeRef = 'W'
    )
    val negative = PhotoThumbnails.exifGps(southWest).getOrElse(fail("未解析出南纬/西经坐标"))
    assertEqualsDouble(negative.latitude, -37.55, 1e-9)
    assertEqualsDouble(negative.longitude, -(126.0 + 58.0 / 60.0), 1e-9)

    assertEquals(PhotoThumbnails.exifGps(jpegBytes(quadrantImage(20, 10))), None)
    assertEquals(PhotoThumbnails.exifGps(pngBytes(ExifJpegs.quadrants(20, 10))), None)
    assertEquals(PhotoThumbnails.exifGps(fixture("lossy.webp")), None)
  }

  test("真实静态 WebP 可生成 JPEG，透明区域使用白底") {
    val lossy = processOrFail(fixture("lossy.webp"))
    assertEquals((lossy.width, lossy.height), (640, 320))
    assertEquals((readImage(lossy.thumbnailJpeg).getWidth, readImage(lossy.thumbnailJpeg).getHeight), (480, 240))
    assert(PhotoThumbnails.process(fixture("lossless.webp")).unsafeRunSync().nonEmpty)
    val transparent = processOrFail(fixture("transparent.webp"))
    val image = readImage(transparent.thumbnailJpeg)
    assertEquals((image.getWidth, image.getHeight), (160, 120))
    assertEquals(colorAt(image, 0, 0), "WHITE")
  }

  test("动画和损坏 WebP 均被拒绝") {
    List("animated.webp", "damaged.webp").foreach { name =>
      assertEquals(PhotoThumbnails.process(fixture(name)).unsafeRunSync(), None)
      assertEquals(PhotoThumbnails.dimensions(fixture(name)).unsafeRunSync(), None)
    }
  }

  private def fixture(name: String): Array[Byte] =
    Files.readAllBytes(Paths.get("..", "tests", "fixtures", "images", name))

  private def processOrFail(bytes: Array[Byte]): PhotoThumbnails.ProcessedImage =
    PhotoThumbnails.process(bytes).unsafeRunSync().getOrElse(fail("照片无法解码"))

  private def quadrantImage(width: Int, height: Int): BufferedImage =
    val image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
    val graphics: Graphics2D = image.createGraphics()
    val middleX = width / 2
    val middleY = height / 2
    graphics.setColor(Color.RED)
    graphics.fillRect(0, 0, middleX, middleY)
    graphics.setColor(Color.GREEN)
    graphics.fillRect(middleX, 0, width - middleX, middleY)
    graphics.setColor(Color.BLUE)
    graphics.fillRect(0, middleY, middleX, height - middleY)
    graphics.setColor(Color.WHITE)
    graphics.fillRect(middleX, middleY, width - middleX, height - middleY)
    graphics.dispose()
    image

  private def jpegBytes(image: BufferedImage): Array[Byte] =
    val output = new ByteArrayOutputStream()
    assert(ImageIO.write(image, "jpg", output), "测试图片 JPEG 编码失败")
    output.toByteArray

  private def pngBytes(image: BufferedImage): Array[Byte] =
    val output = new ByteArrayOutputStream()
    assert(ImageIO.write(image, "png", output), "测试图片 PNG 编码失败")
    output.toByteArray

  private def readImage(bytes: Array[Byte]): BufferedImage =
    ImageIO.read(new ByteArrayInputStream(bytes))

  private def colorAt(image: BufferedImage, horizontal: Int, vertical: Int): String =
    val x = if horizontal == 0 then 3 else image.getWidth - 4
    val y = if vertical == 0 then 3 else image.getHeight - 4
    val rgb = image.getRGB(x, y)
    val red = (rgb >> 16) & 0xff
    val green = (rgb >> 8) & 0xff
    val blue = rgb & 0xff
    if red > 200 && green > 200 && blue > 200 then "WHITE"
    else if red >= green && red >= blue then "RED"
    else if green >= red && green >= blue then "GREEN"
    else "BLUE"

  private def injectOrientation(jpeg: Array[Byte], orientation: Int, bigEndian: Boolean = false): Array[Byte] =
    val exifPayload =
      List('E'.toByte, 'x'.toByte, 'i'.toByte, 'f'.toByte, 0.toByte, 0.toByte) ++
        tiffHeader(bigEndian) ++ ifd(orientation, bigEndian)
    val segmentLength = exifPayload.length + 2
    val segment = List(
      0xff.toByte,
      0xe1.toByte,
      ((segmentLength >> 8) & 0xff).toByte,
      (segmentLength & 0xff).toByte
    ) ++ exifPayload
    (jpeg.take(2).toList ++ segment ++ jpeg.drop(2).toList).toArray

  private def tiffHeader(bigEndian: Boolean): List[Byte] =
    val byteOrder = if bigEndian then List('M'.toByte, 'M'.toByte) else List('I'.toByte, 'I'.toByte)
    byteOrder ++ shortBytes(42, bigEndian) ++ intBytes(8, bigEndian)

  private def ifd(orientation: Int, bigEndian: Boolean): List[Byte] =
    val orientationValue =
      if bigEndian then List(0.toByte, orientation.toByte, 0.toByte, 0.toByte)
      else List(orientation.toByte, 0.toByte, 0.toByte, 0.toByte)
    shortBytes(1, bigEndian) ++
      shortBytes(0x0112, bigEndian) ++
      shortBytes(3, bigEndian) ++
      intBytes(1, bigEndian) ++
      orientationValue ++
      intBytes(0, bigEndian)

  private def shortBytes(value: Int, bigEndian: Boolean): List[Byte] =
    val high = ((value >> 8) & 0xff).toByte
    val low = (value & 0xff).toByte
    if bigEndian then List(high, low) else List(low, high)

  private def intBytes(value: Int, bigEndian: Boolean): List[Byte] =
    val bytes = List(
      ((value >> 24) & 0xff).toByte,
      ((value >> 16) & 0xff).toByte,
      ((value >> 8) & 0xff).toByte,
      (value & 0xff).toByte
    )
    if bigEndian then bytes else bytes.reverse
