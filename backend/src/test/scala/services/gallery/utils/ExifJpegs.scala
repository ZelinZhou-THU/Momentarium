package services.gallery.utils

import java.awt.{Color, Graphics2D}
import java.awt.image.BufferedImage
import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.nio.charset.StandardCharsets
import javax.imageio.ImageIO

import scala.annotation.tailrec

/** 测试夹具：生成带 GPS EXIF 与 EXIF Orientation 的 JPEG，并检查字节中是否残留 EXIF 段。 */
object ExifJpegs:
  private val StartOfImage = 0xd8
  private val EndOfImage = 0xd9
  private val StartOfScan = 0xda
  private val App1Marker = 0xe1
  private val MarkerPrefix = 0xff
  private val ByteMask = 0xff

  /** 四象限彩色图：左上 RED、右上 GREEN、左下 BLUE、右下 WHITE（便于断言方向）。 */
  def quadrants(width: Int, height: Int): BufferedImage =
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

  def jpeg(image: BufferedImage): Array[Byte] =
    val output = new ByteArrayOutputStream()
    val written = ImageIO.write(image, "jpg", output)
    require(written, "测试图片 JPEG 编码失败")
    output.toByteArray

  /** 在 SOI 后插入 APP1 EXIF：IFD0 含 Orientation，并带 GPS IFD（版本、经纬度引用与经纬度有理数）。
    * 默认北纬/东经；测试南纬/西经时可传 S/W。 */
  def withGpsExif(
    jpegBytes: Array[Byte],
    orientation: Int,
    latitudeRef: Char = 'N',
    longitudeRef: Char = 'E'
  ): Array[Byte] =
    val segment = exifSegment(tiffWithGps(orientation, latitudeRef, longitudeRef))
    (jpegBytes.take(2).toList ++ segment.toList ++ jpegBytes.drop(2).toList).toArray

  /** 判断 JPEG 是否还带 APP1 "Exif" 段（展示副本应为 false，原图应为 true）。 */
  def hasExif(bytes: Array[Byte]): Boolean =
    def isExif(payloadStart: Int): Boolean =
      payloadStart + 6 <= bytes.length &&
        bytes(payloadStart) == 'E'.toByte &&
        bytes(payloadStart + 1) == 'x'.toByte &&
        bytes(payloadStart + 2) == 'i'.toByte &&
        bytes(payloadStart + 3) == 'f'.toByte &&
        bytes(payloadStart + 4) == 0.toByte &&
        bytes(payloadStart + 5) == 0.toByte

    @tailrec
    def scan(position: Int): Boolean =
      if position + 1 >= bytes.length || unsigned(bytes(position)) != MarkerPrefix then false
      else
        val marker = unsigned(bytes(position + 1))
        if marker == StartOfScan || marker == EndOfImage then false
        else if marker == MarkerPrefix then scan(position + 1)
        else if marker == 0x01 || (marker >= 0xd0 && marker <= 0xd7) then scan(position + 2)
        else if position + 4 > bytes.length then false
        else
          val segmentLength = (unsigned(bytes(position + 2)) << 8) | unsigned(bytes(position + 3))
          if segmentLength < 2 then false
          else if marker == App1Marker && isExif(position + 4) then true
          else scan(position + 2 + segmentLength)

    bytes.length >= 2 && unsigned(bytes(0)) == MarkerPrefix && unsigned(bytes(1)) == StartOfImage && scan(2)

  def readImage(bytes: Array[Byte]): BufferedImage =
    Option(ImageIO.read(new ByteArrayInputStream(bytes))).getOrElse(throw new IllegalArgumentException("测试图片无法解码"))

  def dimensions(bytes: Array[Byte]): (Int, Int) =
    val image = readImage(bytes)
    (image.getWidth, image.getHeight)

  /** 四角颜色（靠近边缘取样）：TL、TR、BL、BR。 */
  def corners(bytes: Array[Byte]): List[String] =
    val image = readImage(bytes)
    List(
      colorAt(image, 0, 0),
      colorAt(image, 1, 0),
      colorAt(image, 0, 1),
      colorAt(image, 1, 1)
    )

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

  private def exifSegment(tiff: Array[Byte]): Array[Byte] =
    val payload = "Exif".getBytes(StandardCharsets.US_ASCII) ++ Array[Byte](0, 0) ++ tiff
    val segmentLength = payload.length + 2
    Array[Byte](
      0xff.toByte,
      0xe1.toByte,
      ((segmentLength >> 8) & 0xff).toByte,
      (segmentLength & 0xff).toByte
    ) ++ payload

  /** 小端 TIFF：IFD0（Orientation + GPSInfo）→ GPS IFD → 经纬度 RATIONAL 数据区。 */
  private def tiffWithGps(orientation: Int, latitudeRef: Char, longitudeRef: Char): Array[Byte] =
    val ifd0Offset = 8
    val ifd0EntryCount = 2
    val gpsIfdOffset = ifd0Offset + 2 + ifd0EntryCount * 12 + 4
    val gpsEntryCount = 5
    val latitudeOffset = gpsIfdOffset + 2 + gpsEntryCount * 12 + 4
    val longitudeOffset = latitudeOffset + 24
    val header = bytes("II") ++ short(42) ++ long(8)
    val ifd0 =
      short(ifd0EntryCount) ++
        entry(0x0112, 3, 1, short(orientation) ++ List(0.toByte, 0.toByte)) ++
        entry(0x8825, 4, 1, long(gpsIfdOffset)) ++
        long(0)
    val gps =
      short(gpsEntryCount) ++
        entry(0x0000, 1, 4, List[Byte](2, 3, 0, 0)) ++
        entry(0x0001, 2, 2, bytes(latitudeRef.toString) ++ List[Byte](0, 0, 0)) ++
        entry(0x0002, 5, 3, long(latitudeOffset)) ++
        entry(0x0003, 2, 2, bytes(longitudeRef.toString) ++ List[Byte](0, 0, 0)) ++
        entry(0x0004, 5, 3, long(longitudeOffset)) ++
        long(0)
    val latitudeData = rational(37, 1) ++ rational(33, 1) ++ rational(0, 1)
    val longitudeData = rational(126, 1) ++ rational(58, 1) ++ rational(0, 1)
    (header ++ ifd0 ++ gps ++ latitudeData ++ longitudeData).toArray

  private def entry(tag: Int, fieldType: Int, count: Int, value: List[Byte]): List[Byte] =
    short(tag) ++ short(fieldType) ++ long(count) ++ value.take(4).padTo(4, 0.toByte)

  private def rational(numerator: Int, denominator: Int): List[Byte] =
    long(numerator) ++ long(denominator)

  private def bytes(value: String): List[Byte] =
    value.getBytes(StandardCharsets.US_ASCII).toList

  private def short(value: Int): List[Byte] =
    List((value & ByteMask).toByte, ((value >> 8) & ByteMask).toByte)

  private def long(value: Int): List[Byte] =
    List(
      (value & ByteMask).toByte,
      ((value >> 8) & ByteMask).toByte,
      ((value >> 16) & ByteMask).toByte,
      ((value >> 24) & ByteMask).toByte
    )

  private def unsigned(byte: Byte): Int =
    byte & ByteMask
