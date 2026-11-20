package services.scene.utils

import java.util.Base64

import scala.util.Try

import services.system.ai.objects.ImageBytes

/**
 * reviewscene 截图输入校验（spec §9.5 硬门禁 5）：只接受 data:image/jpeg;base64 形式的合法 JPEG，
 * 且恰好 4 张、每张 ≤2MB。校验失败不抛 400，而是作为硬门禁失败原因交给评审裁决。
 */
private[scene] object SceneCaptures:

  private val DataUrlPrefix = "data:image/jpeg;base64,"
  private val JpegMagic: Array[Byte] = Array(0xff.toByte, 0xd8.toByte, 0xff.toByte)

  /** 解析成功返回 4 张图片字节；失败返回可直接展示/回灌的硬门禁原因。 */
  def parse(captures: List[String]): Either[List[String], List[ImageBytes]] =
    val countIssues =
      if captures.size == SceneContract.CaptureCount then Nil
      else List(s"截图数量应为 ${SceneContract.CaptureCount} 张，实际 ${captures.size} 张")
    val parsed = captures.zipWithIndex.map { case (capture, index) =>
      parseOne(capture) match
        case Right(image) => Right(image)
        case Left(issue) => Left(s"截图 ${index + 1}：$issue")
    }
    val issues = countIssues ++ parsed.collect { case Left(issue) => issue }
    if issues.nonEmpty then Left(issues)
    else Right(parsed.collect { case Right(image) => image })

  private def parseOne(value: String): Either[String, ImageBytes] =
    if !value.regionMatches(true, 0, DataUrlPrefix, 0, DataUrlPrefix.length) then
      Left("不是 image/jpeg 的 base64 data URL")
    else
      val payload = value.substring(DataUrlPrefix.length).trim
      if payload.isEmpty then Left("data URL 没有 base64 内容")
      else
        Try(Base64.getDecoder.decode(payload)).toEither
          .left
          .map(_ => "base64 解码失败")
          .flatMap(bytes => validateBytes(bytes).map(_ => ImageBytes(bytes, "image/jpeg")))

  private def validateBytes(bytes: Array[Byte]): Either[String, Unit] =
    if bytes.length > SceneContract.MaxCaptureBytes then
      Left(f"超过单张 2MB 上限（实际 ${bytes.length / 1024.0}%.1fKB）")
    else if bytes.length < JpegMagic.length || !JpegMagic.indices.forall(index => bytes(index) == JpegMagic(index)) then
      Left("不是合法 JPEG（文件头不符）")
    else Right(())
