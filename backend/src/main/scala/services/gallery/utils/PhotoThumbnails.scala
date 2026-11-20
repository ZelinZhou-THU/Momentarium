package services.gallery.utils

import java.awt.{Color, RenderingHints}
import java.awt.geom.AffineTransform
import java.awt.image.BufferedImage
import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.nio.charset.StandardCharsets
import javax.imageio.{IIOImage, ImageIO, ImageWriteParam}

import cats.effect.{IO, Resource}
import cats.syntax.all.*
import scala.annotation.tailrec
import scala.util.Try

import services.gallery.objects.{GpsCoordinates, PhotoFormat}

/** 照片解码、EXIF 方向纠正、缩略图与去元数据展示副本生成（JPEG 输出不携带 EXIF/注释等元数据）。 */
private[gallery] object PhotoThumbnails:
  /** 缩略图统一输出 JPEG（PNG/WebP 原图的缩略图也是如此）。 */
  val ThumbnailMimeType: String = "image/jpeg"

  /** 公开展示副本统一输出 JPEG（PNG/WebP 原图的展示副本同样转码为 JPEG）。 */
  val DisplayMimeType: String = "image/jpeg"

  private val ThumbnailLongEdge: Int = 480
  private val ThumbnailQuality: Float = 0.85f
  private val DisplayQuality: Float = 0.85f
  private val RenderQuality: Float = 0.9f
  private val DefaultOrientation: Int = 1
  private val MaxOrientation: Int = 8
  private val StartOfImage: Int = 0xd8
  private val EndOfImage: Int = 0xd9
  private val StartOfScan: Int = 0xda
  private val ExifMarker: Int = 0xe1
  private val IptcMarker: Int = 0xed
  private val CommentMarker: Int = 0xfe
  private val OrientationTag: Int = 0x0112
  private val GpsInfoTag: Int = 0x8825
  private val GpsLatitudeRefTag: Int = 0x0001
  private val GpsLatitudeTag: Int = 0x0002
  private val GpsLongitudeRefTag: Int = 0x0003
  private val GpsLongitudeTag: Int = 0x0004
  private val AsciiType: Int = 2
  private val RationalType: Int = 5
  private val LatitudeLimit: Double = 90.0
  private val LongitudeLimit: Double = 180.0
  private val ShortType: Int = 3
  private val ExifHeaderLength: Int = 6
  private val TiffMagic: Int = 42
  private val EntrySize: Int = 12
  private val LittleEndianMarker: Byte = 'I'.toByte
  private val BigEndianMarker: Byte = 'M'.toByte
  private val ByteMask: Int = 0xff
  private val PngSignature: Array[Byte] =
    Array(0x89.toByte, 0x50.toByte, 0x4e.toByte, 0x47.toByte, 0x0d.toByte, 0x0a.toByte, 0x1a.toByte, 0x0a.toByte)
  private val PngChunkHeaderLength: Int = 8
  private val PngChunkTrailerLength: Int = 4
  private val MetadataPngChunks: Set[String] = Set("eXIf", "tEXt", "zTXt", "iTXt", "tIME")

  /** 处理结果：方向纠正后的原图宽高 + 缩略图 JPEG + 全尺寸去元数据展示副本 JPEG。 */
  final case class ProcessedImage(
    width: Int,
    height: Int,
    thumbnailJpeg: Array[Byte],
    displayJpeg: Array[Byte]
  )

  /** 渲染封面重编码结果：字节、响应 mime 与方向纠正后的宽高。 */
  final case class SanitizedImage(bytes: Array[Byte], mimeType: String, width: Int, height: Int)

  /** 解码并生成缩略图与展示副本；文件头合法但内容无法解码时返回 None（调用方按 UPLOAD_UNSUPPORTED_TYPE 处理）。 */
  def process(bytes: Array[Byte]): IO[Option[ProcessedImage]] =
    decode(bytes).flatMap {
      case None => IO.pure(None)
      case Some(source) =>
        render(source, exifOrientation(bytes)) match
          case None => IO.pure(None)
          case Some((corrected, thumbnail)) =>
            for
              thumbnailJpeg <- encodeJpeg(thumbnail, ThumbnailQuality)
              displayJpeg <- encodeJpeg(opaqueImage(corrected), DisplayQuality)
            yield (thumbnailJpeg, displayJpeg).mapN((thumbnailBytes, displayBytes) =>
              ProcessedImage(corrected.getWidth, corrected.getHeight, thumbnailBytes, displayBytes)
            )
    }

  /** 渲染封面上传的重编码：按 EXIF 方向纠正后整图重新编码，输出不携带任何 EXIF/注释等元数据。
    *
    * 只接受上传链路允许的 JPEG/PNG；WebP 返回 None（由调用方按 COVER_UNSUPPORTED_TYPE 拒绝）。
    */
  def sanitize(bytes: Array[Byte], format: PhotoFormat): IO[Option[SanitizedImage]] =
    decode(bytes).flatMap {
      case None => IO.pure(None)
      case Some(source) =>
        Try(applyOrientation(source, exifOrientation(bytes))).toOption match
          case None => IO.pure(None)
          case Some(corrected) =>
            encodeFor(format, corrected).map(_.map(encoded =>
              SanitizedImage(encoded, format.mimeType, corrected.getWidth, corrected.getHeight)
            ))
    }

  /** 解码并返回 EXIF 方向纠正后的原图宽高；文件头合法但内容无法解码时返回 None。 */
  def dimensions(bytes: Array[Byte]): IO[Option[(Int, Int)]] =
    decode(bytes).map { decoded =>
      decoded.flatMap(source =>
        Try {
          val corrected = applyOrientation(source, exifOrientation(bytes))
          (corrected.getWidth, corrected.getHeight)
        }.toOption
      )
    }

  /** 读取 JPEG APP1 EXIF 的 Orientation 标签（1–8）；无 EXIF 或解析失败按 1（正常方向）处理。 */
  def exifOrientation(bytes: Array[Byte]): Int =
    if bytes.length < 2 || unsigned(bytes(0)) != ByteMask || unsigned(bytes(1)) != StartOfImage then DefaultOrientation
    else
      findExifSegment(bytes, 2)
        .flatMap(payloadStart => parseOrientation(bytes, payloadStart))
        .getOrElse(DefaultOrientation)

  /** 读取 JPEG APP1 EXIF 的 GPS 经纬度（WGS84）；无 EXIF/无 GPS/PNG/WebP 返回 None（阶段 1 已知限制）。 */
  def exifGps(bytes: Array[Byte]): Option[GpsCoordinates] =
    if bytes.length < 2 || unsigned(bytes(0)) != ByteMask || unsigned(bytes(1)) != StartOfImage then None
    else findExifSegment(bytes, 2).flatMap(payloadStart => parseGps(bytes, payloadStart))

  /** 判断 JPEG/PNG 字节是否含有需要清除的元数据（EXIF/GPS、XMP/IPTC、JPEG 注释、PNG 文本/时间/eXIf 块）。
    *
    * 供一次性历史回填判断 render 封面是否需要重编码；展示副本由重编码生成，本身必然不含这些段。
    */
  def hasMetadata(bytes: Array[Byte]): Boolean =
    if isJpeg(bytes) then jpegHasMetadata(bytes)
    else if isPng(bytes) then pngHasMetadata(bytes)
    else false

  private def isJpeg(bytes: Array[Byte]): Boolean =
    bytes.length >= 3 && unsigned(bytes(0)) == ByteMask && unsigned(bytes(1)) == StartOfImage

  private def jpegHasMetadata(bytes: Array[Byte]): Boolean =
    @tailrec
    def scan(position: Int): Boolean =
      if position + 1 >= bytes.length || unsigned(bytes(position)) != ByteMask then false
      else
        val marker = unsigned(bytes(position + 1))
        if marker == StartOfScan || marker == EndOfImage then false
        else if marker == ByteMask then scan(position + 1)
        else if marker == 0x01 || (marker >= 0xd0 && marker <= 0xd7) then scan(position + 2)
        else if position + 4 > bytes.length then false
        else
          val segmentLength = (unsigned(bytes(position + 2)) << 8) | unsigned(bytes(position + 3))
          if segmentLength < 2 then false
          else if isMetadataMarker(marker) then true
          else scan(position + 2 + segmentLength)

    scan(2)

  private def isMetadataMarker(marker: Int): Boolean =
    marker == ExifMarker || marker == IptcMarker || marker == CommentMarker

  private def isPng(bytes: Array[Byte]): Boolean =
    bytes.length >= PngSignature.length && PngSignature.indices.forall(index => bytes(index) == PngSignature(index))

  private def pngHasMetadata(bytes: Array[Byte]): Boolean =
    @tailrec
    def scan(position: Int): Boolean =
      if position.toLong + PngChunkHeaderLength > bytes.length then false
      else
        val length = (0 until 4).map(index => unsigned(bytes(position + index)).toLong << (8 * (3 - index))).sum
        val chunkType = new String(bytes, position + 4, 4, StandardCharsets.US_ASCII)
        val next = position.toLong + PngChunkHeaderLength + length + PngChunkTrailerLength
        if next > bytes.length then false
        else if chunkType == "IEND" then false
        else if MetadataPngChunks.contains(chunkType) then true
        else scan(next.toInt)

    scan(PngSignature.length)

  private def decode(bytes: Array[Byte]): IO[Option[BufferedImage]] =
    IO.blocking(Option.unless(isAnimatedWebp(bytes))(bytes).flatMap(data =>
      Try(ImageIO.read(new ByteArrayInputStream(data))).toOption.flatMap(image => Option(image))
    ))

  private def isAnimatedWebp(bytes: Array[Byte]): Boolean =
    def tag(offset: Int, value: String): Boolean =
      offset >= 0 && offset + value.length <= bytes.length &&
        value.indices.forall(index => bytes(offset + index) == value.charAt(index).toByte)

    @tailrec
    def scan(offset: Int): Boolean =
      if offset < 0 || offset.toLong + 8 > bytes.length then false
      else
        val size = (0 until 4).map(index => unsigned(bytes(offset + 4 + index)).toLong << (8 * index)).sum
        val next = offset.toLong + 8 + size + (size & 1)
        if next > bytes.length then false
        else if tag(offset, "ANIM") || (tag(offset, "VP8X") && size >= 1 && (unsigned(bytes(offset + 8)) & 2) != 0) then true
        else scan(next.toInt)

    tag(0, "RIFF") && tag(8, "WEBP") && scan(12)

  private def render(source: BufferedImage, orientation: Int): Option[(BufferedImage, BufferedImage)] =
    Try {
      val corrected = applyOrientation(source, orientation)
      (corrected, scaleToLongEdge(corrected, ThumbnailLongEdge))
    }.toOption

  @tailrec
  private def findExifSegment(bytes: Array[Byte], position: Int): Option[Int] =
    if position + 1 >= bytes.length || unsigned(bytes(position)) != ByteMask then None
    else
      val marker = unsigned(bytes(position + 1))
      if marker == StartOfScan || marker == EndOfImage then None
      else if marker == ByteMask then findExifSegment(bytes, position + 1)
      else if marker == 0x01 || (marker >= 0xd0 && marker <= 0xd7) then findExifSegment(bytes, position + 2)
      else if position + 4 > bytes.length then None
      else
        val segmentLength = (unsigned(bytes(position + 2)) << 8) | unsigned(bytes(position + 3))
        val payloadStart = position + 4
        if segmentLength < 2 || payloadStart + segmentLength - 2 > bytes.length then None
        else if marker == ExifMarker && isExifHeader(bytes, payloadStart) then Some(payloadStart)
        else findExifSegment(bytes, payloadStart + segmentLength - 2)

  private def isExifHeader(bytes: Array[Byte], payloadStart: Int): Boolean =
    payloadStart + ExifHeaderLength <= bytes.length &&
      bytes(payloadStart) == 'E'.toByte &&
      bytes(payloadStart + 1) == 'x'.toByte &&
      bytes(payloadStart + 2) == 'i'.toByte &&
      bytes(payloadStart + 3) == 'f'.toByte &&
      bytes(payloadStart + 4) == 0 &&
      bytes(payloadStart + 5) == 0

  private def parseOrientation(bytes: Array[Byte], payloadStart: Int): Option[Int] =
    val tiffStart = payloadStart + ExifHeaderLength
    for
      firstByte <- at(bytes, tiffStart)
      secondByte <- at(bytes, tiffStart + 1)
      littleEndian <- byteOrder(firstByte, secondByte)
      magic <- readUInt16(bytes, tiffStart + 2, littleEndian)
      if magic == TiffMagic
      ifdOffset <- readUInt32(bytes, tiffStart + 4, littleEndian)
      entryCount <- readUInt16(bytes, tiffStart + ifdOffset, littleEndian)
      orientation <- findOrientation(bytes, tiffStart + ifdOffset + 2, entryCount, littleEndian)
    yield orientation

  private def byteOrder(firstByte: Byte, secondByte: Byte): Option[Boolean] =
    if firstByte == LittleEndianMarker && secondByte == LittleEndianMarker then Some(true)
    else if firstByte == BigEndianMarker && secondByte == BigEndianMarker then Some(false)
    else None

  private def findOrientation(
    bytes: Array[Byte],
    entriesStart: Int,
    entryCount: Int,
    littleEndian: Boolean
  ): Option[Int] =
    val readableEntries = math.max(0, math.min(entryCount, (bytes.length - entriesStart) / EntrySize))
    (0 until readableEntries).iterator
      .flatMap(index => readOrientation(bytes, entriesStart + index * EntrySize, littleEndian))
      .nextOption()

  private def readOrientation(bytes: Array[Byte], entryStart: Int, littleEndian: Boolean): Option[Int] =
    readUInt16(bytes, entryStart, littleEndian).filter(tag => tag == OrientationTag).flatMap { _ =>
      for
        dataType <- readUInt16(bytes, entryStart + 2, littleEndian)
        if dataType == ShortType
        valueCount <- readUInt32(bytes, entryStart + 4, littleEndian)
        if valueCount >= 1
        orientation <- readUInt16(bytes, entryStart + 8, littleEndian)
        if orientation >= DefaultOrientation && orientation <= MaxOrientation
      yield orientation
    }

  private def parseGps(bytes: Array[Byte], payloadStart: Int): Option[GpsCoordinates] =
    val tiffStart = payloadStart + ExifHeaderLength
    for
      firstByte <- at(bytes, tiffStart)
      secondByte <- at(bytes, tiffStart + 1)
      littleEndian <- byteOrder(firstByte, secondByte)
      magic <- readUInt16(bytes, tiffStart + 2, littleEndian)
      if magic == TiffMagic
      ifdOffset <- readUInt32(bytes, tiffStart + 4, littleEndian)
      ifdStart = tiffStart + ifdOffset
      ifdEntryCount <- readUInt16(bytes, ifdStart, littleEndian)
      gpsIfdOffset <- findIfdPointer(bytes, ifdStart + 2, ifdEntryCount, littleEndian, GpsInfoTag)
      gpsIfdStart = tiffStart + gpsIfdOffset
      gpsEntryCount <- readUInt16(bytes, gpsIfdStart, littleEndian)
      latitude <- gpsCoordinate(
                    bytes,
                    tiffStart,
                    gpsIfdStart + 2,
                    gpsEntryCount,
                    littleEndian,
                    coordinateTag = GpsLatitudeTag,
                    referenceTag = GpsLatitudeRefTag,
                    maxAbsolute = LatitudeLimit,
                    positiveReference = 'N',
                    negativeReference = 'S'
                  )
      longitude <- gpsCoordinate(
                     bytes,
                     tiffStart,
                     gpsIfdStart + 2,
                     gpsEntryCount,
                     littleEndian,
                     coordinateTag = GpsLongitudeTag,
                     referenceTag = GpsLongitudeRefTag,
                     maxAbsolute = LongitudeLimit,
                     positiveReference = 'E',
                     negativeReference = 'W'
                   )
    yield GpsCoordinates(latitude, longitude)

  /** IFD0 中的 GPSInfo 指针（相对 TIFF 起始的偏移）。 */
  private def findIfdPointer(
    bytes: Array[Byte],
    entriesStart: Int,
    entryCount: Int,
    littleEndian: Boolean,
    tag: Int
  ): Option[Int] =
    readableEntryIndexes(bytes, entriesStart, entryCount)
      .flatMap(index => {
        val entryStart = entriesStart + index * EntrySize
        for
          entryTag <- readUInt16(bytes, entryStart, littleEndian)
          if entryTag == tag
          offset <- readUInt32(bytes, entryStart + 8, littleEndian)
        yield offset
      })
      .nextOption()

  private def gpsCoordinate(
    bytes: Array[Byte],
    tiffStart: Int,
    entriesStart: Int,
    entryCount: Int,
    littleEndian: Boolean,
    coordinateTag: Int,
    referenceTag: Int,
    maxAbsolute: Double,
    positiveReference: Char,
    negativeReference: Char
  ): Option[Double] =
    for
      dataOffset <- findRationalEntryOffset(bytes, entriesStart, entryCount, littleEndian, coordinateTag)
      degrees <- readRational(bytes, tiffStart + dataOffset, littleEndian)
      minutes <- readRational(bytes, tiffStart + dataOffset + 8, littleEndian)
      seconds <- readRational(bytes, tiffStart + dataOffset + 16, littleEndian)
      if minutes >= 0.0 && minutes < 60.0 && seconds >= 0.0 && seconds < 60.0
      reference <- findAsciiEntryValue(bytes, entriesStart, entryCount, littleEndian, referenceTag)
      sign =
        if reference == positiveReference.toByte then 1.0
        else if reference == negativeReference.toByte then -1.0
        else Double.NaN
      if sign.isFinite
      coordinate = sign * (degrees + minutes / 60.0 + seconds / 3600.0)
      if coordinate.isFinite && math.abs(coordinate) <= maxAbsolute
    yield coordinate

  private def findRationalEntryOffset(
    bytes: Array[Byte],
    entriesStart: Int,
    entryCount: Int,
    littleEndian: Boolean,
    tag: Int
  ): Option[Int] =
    readableEntryIndexes(bytes, entriesStart, entryCount)
      .flatMap(index => {
        val entryStart = entriesStart + index * EntrySize
        for
          entryTag <- readUInt16(bytes, entryStart, littleEndian)
          if entryTag == tag
          dataType <- readUInt16(bytes, entryStart + 2, littleEndian)
          if dataType == RationalType
          valueCount <- readUInt32(bytes, entryStart + 4, littleEndian)
          if valueCount >= 3
          offset <- readUInt32(bytes, entryStart + 8, littleEndian)
        yield offset
      })
      .nextOption()

  private def findAsciiEntryValue(
    bytes: Array[Byte],
    entriesStart: Int,
    entryCount: Int,
    littleEndian: Boolean,
    tag: Int
  ): Option[Byte] =
    readableEntryIndexes(bytes, entriesStart, entryCount)
      .flatMap(index => {
        val entryStart = entriesStart + index * EntrySize
        for
          entryTag <- readUInt16(bytes, entryStart, littleEndian)
          if entryTag == tag
          dataType <- readUInt16(bytes, entryStart + 2, littleEndian)
          if dataType == AsciiType
          value <- at(bytes, entryStart + 8)
        yield value
      })
      .nextOption()

  private def readRational(bytes: Array[Byte], offset: Int, littleEndian: Boolean): Option[Double] =
    for
      numerator <- readUInt32(bytes, offset, littleEndian)
      denominator <- readUInt32(bytes, offset + 4, littleEndian)
      if denominator != 0
    yield numerator.toDouble / denominator.toDouble

  private def readableEntryIndexes(bytes: Array[Byte], entriesStart: Int, entryCount: Int): Iterator[Int] =
    (0 until math.max(0, math.min(entryCount, (bytes.length - entriesStart) / EntrySize))).iterator

  private def at(bytes: Array[Byte], index: Int): Option[Byte] =
    Option.when(index >= 0 && index < bytes.length)(bytes(index))

  private def readUInt16(bytes: Array[Byte], offset: Int, littleEndian: Boolean): Option[Int] =
    Option.when(offset >= 0 && offset + 2 <= bytes.length) {
      val first = unsigned(bytes(offset))
      val second = unsigned(bytes(offset + 1))
      if littleEndian then first | (second << 8) else (first << 8) | second
    }

  private def readUInt32(bytes: Array[Byte], offset: Int, littleEndian: Boolean): Option[Int] =
    Option.when(offset >= 0 && offset + 4 <= bytes.length) {
      (0 until 4)
        .map(index => unsigned(bytes(offset + index)).toLong << (8 * (if littleEndian then index else 3 - index)))
        .sum
    }.filter(value => value <= Int.MaxValue).map(_.toInt)

  private def unsigned(byte: Byte): Int =
    byte & ByteMask

  private def applyOrientation(source: BufferedImage, orientation: Int): BufferedImage =
    if orientation <= DefaultOrientation || orientation > MaxOrientation then source
    else
      val sourceWidth = source.getWidth
      val sourceHeight = source.getHeight
      val swapsAxes = orientation >= 5
      val destinationWidth = if swapsAxes then sourceHeight else sourceWidth
      val destinationHeight = if swapsAxes then sourceWidth else sourceHeight
      val destination = new BufferedImage(destinationWidth, destinationHeight, BufferedImage.TYPE_INT_RGB)
      val graphics = destination.createGraphics()
      graphics.setColor(Color.WHITE)
      graphics.fillRect(0, 0, destinationWidth, destinationHeight)
      graphics.setTransform(orientationTransform(orientation, sourceWidth, sourceHeight))
      graphics.drawImage(source, 0, 0, null)
      graphics.dispose()
      destination

  /** JPEG 不支持透明通道：带 alpha 或非常规色彩模型的图像先铺白底转成 RGB，避免编码失败或黑底。 */
  private def opaqueImage(source: BufferedImage): BufferedImage =
    if source.getType == BufferedImage.TYPE_INT_RGB || source.getType == BufferedImage.TYPE_3BYTE_BGR then source
    else
      val destination = new BufferedImage(source.getWidth, source.getHeight, BufferedImage.TYPE_INT_RGB)
      val graphics = destination.createGraphics()
      graphics.setColor(Color.WHITE)
      graphics.fillRect(0, 0, source.getWidth, source.getHeight)
      graphics.drawImage(source, 0, 0, null)
      graphics.dispose()
      destination

  private def orientationTransform(orientation: Int, width: Int, height: Int): AffineTransform =
    orientation match
      case 2 => new AffineTransform(-1f, 0f, 0f, 1f, width.toFloat, 0f)
      case 3 => new AffineTransform(-1f, 0f, 0f, -1f, width.toFloat, height.toFloat)
      case 4 => new AffineTransform(1f, 0f, 0f, -1f, 0f, height.toFloat)
      case 5 => new AffineTransform(0f, 1f, 1f, 0f, 0f, 0f)
      case 6 => new AffineTransform(0f, 1f, -1f, 0f, height.toFloat, 0f)
      case 7 => new AffineTransform(0f, -1f, -1f, 0f, height.toFloat, width.toFloat)
      case _ => new AffineTransform(0f, -1f, 1f, 0f, 0f, width.toFloat)

  private def scaleToLongEdge(source: BufferedImage, longEdge: Int): BufferedImage =
    val width = source.getWidth
    val height = source.getHeight
    val longestEdge = math.max(width, height)
    if longestEdge <= longEdge && !source.getColorModel.hasAlpha then source
    else
      val scale = math.min(1.0, longEdge.toDouble / longestEdge)
      val targetWidth = math.max(1, math.round(width * scale).toInt)
      val targetHeight = math.max(1, math.round(height * scale).toInt)
      val destination = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_RGB)
      val graphics = destination.createGraphics()
      graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
      graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
      graphics.setColor(Color.WHITE)
      graphics.fillRect(0, 0, targetWidth, targetHeight)
      graphics.drawImage(source, 0, 0, targetWidth, targetHeight, null)
      graphics.dispose()
      destination

  private def encodeFor(format: PhotoFormat, image: BufferedImage): IO[Option[Array[Byte]]] =
    format match
      case PhotoFormat.Jpeg => encodeJpeg(opaqueImage(image), RenderQuality)
      case PhotoFormat.Png => encodePng(image)
      case PhotoFormat.Webp => IO.pure(None)

  private def encodePng(image: BufferedImage): IO[Option[Array[Byte]]] =
    IO.blocking {
      val output = new ByteArrayOutputStream()
      Try(ImageIO.write(image, "png", output)).toOption.flatMap(written => Option.when(written)(output.toByteArray))
    }

  private def encodeJpeg(image: BufferedImage, quality: Float): IO[Option[Array[Byte]]] =
    IO.blocking {
      val writers = ImageIO.getImageWritersByFormatName("jpeg")
      Option.when(writers.hasNext)(writers.next())
    }.flatMap {
      case None => IO.pure(None)
      case Some(writer) =>
        Resource.make(IO.pure(writer))(activeWriter => IO.blocking(activeWriter.dispose())).use { activeWriter =>
          val output = new ByteArrayOutputStream()
          Resource.fromAutoCloseable(IO.blocking(ImageIO.createImageOutputStream(output))).use { stream =>
            IO.blocking(
              Try {
                val parameters = activeWriter.getDefaultWriteParam
                parameters.setCompressionMode(ImageWriteParam.MODE_EXPLICIT)
                parameters.setCompressionQuality(quality)
                activeWriter.setOutput(stream)
                activeWriter.write(null, new IIOImage(image, null, null), parameters)
                stream.flush()
                output.toByteArray
              }.toOption
            )
          }
        }
    }
