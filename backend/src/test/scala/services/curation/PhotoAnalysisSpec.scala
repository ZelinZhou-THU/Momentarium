package services.curation

import java.time.Instant
import java.util.UUID

import io.circe.syntax.*

import munit.FunSuite

import services.curation.objects.{PhotoAnalysis, PhotoAnalysisRecord}
import services.curation.utils.prompts.PhotoAnalysisPrompts
import services.gallery.objects.PhotoId

/** 照片分析对象的编解码与分析提示词的自包含校验（纯函数，不连数据库）。 */
class PhotoAnalysisSpec extends FunSuite:

  private val analysis = PhotoAnalysis(
    description = "傍晚的礁石被浪反复打湿",
    mood = "安静的眷恋",
    palette = List("#1B2A4A", "#F2A65A", "#2E2B33"),
    memoryCues = List("退潮后礁石上的盐光"),
    sensory = "咸湿海风与浪声",
    suggestedCaption = "浪把黄昏揉碎在黑石上"
  )

  test("PhotoAnalysis 编解码往返一致") {
    assertEquals(analysis.asJson.as[PhotoAnalysis], Right(analysis))
  }

  test("PhotoAnalysisRecord 编解码往返一致（含 photoId/model/analyzedAt）") {
    val record = PhotoAnalysisRecord(
      photoId = PhotoId(UUID.fromString("00000000-0000-0000-0000-000000000001")),
      analysis = analysis,
      model = "deepseek-v4.1-flash",
      analyzedAt = Instant.parse("2026-10-27T12:00:00Z")
    )
    assertEquals(record.asJson.as[PhotoAnalysisRecord], Right(record))
  }

  test("照片分析提示词带字数约束、JSON 要求与低温度") {
    val prompt = PhotoAnalysisPrompts.analyze("photo-analysis-session")
    assertEquals(prompt.sessionId, "photo-analysis-session")
    assertEquals(prompt.temperature, Some(0.3))
    assert(prompt.instructions.contains("只输出一个 JSON 对象"), "必须要求纯 JSON 输出")
    assert(prompt.instructions.contains("≤120"), "description 必须有字数上限")
    assert(prompt.instructions.contains("不要虚构画面外内容"), "必须禁止虚构画面外内容")
    assert(prompt.instructions.contains("≤5 条"), "memoryCues 必须有条数上限")
  }

  test("提示词里的 JSON 示例能解码为 PhotoAnalysis 且满足字数约束") {
    val example = PhotoAnalysisPrompts.analyze("photo-analysis-session").responseExample.as[PhotoAnalysis]
    assert(example.isRight, s"示例无法解码为 PhotoAnalysis：$example")
    example.toOption.foreach { decoded =>
      assert(decoded.description.length <= 120)
      assert(decoded.mood.length <= 20)
      assert(decoded.sensory.length <= 40)
      assert(decoded.suggestedCaption.length <= 30)
      assert(decoded.memoryCues.size <= 5)
      assert(decoded.palette.size >= 3 && decoded.palette.size <= 5)
      assert(decoded.palette.forall(_.matches("#[0-9A-Fa-f]{6}")))
    }
  }
