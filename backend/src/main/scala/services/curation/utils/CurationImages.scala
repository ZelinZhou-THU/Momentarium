package services.curation.utils

import java.awt.image.BufferedImage
import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import javax.imageio.{IIOImage, ImageIO, ImageWriteParam}

import cats.effect.IO

import services.system.ai.objects.ImageBytes

/** 把 gallery 返回的原图字节压缩为长边 1024 的 JPEG，供 VLM 分析（spec 10.1：输入单张长边 1024px）。 */
private[curation] object CurationImages:

  private val LongEdge = 1024
  private val JpegQuality = 0.85f

  def toAnalysisImage(original: Array[Byte]): IO[ImageBytes] =
    IO.blocking(Option(ImageIO.read(new ByteArrayInputStream(original))))
      .flatMap(decoded => IO.fromOption(decoded)(IllegalArgumentException("无法解析照片内容：不是受支持的图片格式")))
      .flatMap(image => IO.blocking(ImageBytes(encodeJpeg(scaleToLongEdge(image)), "image/jpeg")))

  private def scaleToLongEdge(source: BufferedImage): BufferedImage =
    val longSide = math.max(source.getWidth, source.getHeight)
    if longSide <= LongEdge then source
    else
      val ratio = LongEdge.toDouble / longSide
      val width = math.max(1, math.round(source.getWidth * ratio).toInt)
      val height = math.max(1, math.round(source.getHeight * ratio).toInt)
      val target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
      val graphics = target.createGraphics()
      graphics.setRenderingHint(
        java.awt.RenderingHints.KEY_INTERPOLATION,
        java.awt.RenderingHints.VALUE_INTERPOLATION_BICUBIC
      )
      graphics.drawImage(source, 0, 0, width, height, null)
      graphics.dispose()
      target

  private def encodeJpeg(image: BufferedImage): Array[Byte] =
    val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
    val parameters = writer.getDefaultWriteParam
    parameters.setCompressionMode(ImageWriteParam.MODE_EXPLICIT)
    parameters.setCompressionQuality(JpegQuality)
    val output = new ByteArrayOutputStream()
    val imageOutput = ImageIO.createImageOutputStream(output)
    writer.setOutput(imageOutput)
    writer.write(null, new IIOImage(image, null, null), parameters)
    imageOutput.close()
    writer.dispose()
    output.toByteArray
