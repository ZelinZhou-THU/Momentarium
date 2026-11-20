package services.system.ai

import io.circe.Json
import cats.syntax.all.*

import munit.CatsEffectSuite

import services.curation.objects.PhotoAnalysis
import services.scene.objects.{ReviewVerdict, RubricScores}
import services.system.ai.fake.{FakeLocationModel, FakeReviewModel, FakeTextModel, FakeVisionModel}
import services.system.ai.objects.{ImageBytes, LocationCandidatePrompt, PhotoAnalysisPrompt, ReviewPrompt, StructuredPrompt, TextPrompt}

/** Fake 端口的确定性单测：structured 解析、视觉结果稳定、评审固定分数。 */
class FakeAiModelsSuite extends CatsEffectSuite:

  private val jpegImage = ImageBytes(Array[Byte](0xff.toByte, 0xd8.toByte, 0xff.toByte, 0x20, 0x40), "image/jpeg")

  private val analysisExample: Json = Json.obj(
    "description" -> Json.fromString("黑礁石被浪花反复冲刷"),
    "mood" -> Json.fromString("孤独而坚定"),
    "palette" -> Json.arr(Json.fromString("#1B2A4A"), Json.fromString("#F2A65A")),
    "memoryCues" -> Json.arr(Json.fromString("退潮后的盐光")),
    "sensory" -> Json.fromString("咸湿海风"),
    "suggestedCaption" -> Json.fromString("浪把黄昏揉碎在黑石上")
  )

  test("FakeTextModel.structured 把 responseExample 解码为类型化对象") {
    val prompt = StructuredPrompt("session-1", "输出照片分析 JSON", analysisExample)
    FakeTextModel().structured[PhotoAnalysis](prompt).map { analysis =>
      assertEquals(analysis.description, "黑礁石被浪花反复冲刷")
      assertEquals(analysis.mood, "孤独而坚定")
      assertEquals(analysis.palette, List("#1B2A4A", "#F2A65A"))
      assertEquals(analysis.memoryCues, List("退潮后的盐光"))
    }
  }

  test("FakeVisionModel 对同一图片字节给出确定性结果") {
    val vision = FakeVisionModel()
    val prompt = PhotoAnalysisPrompt("session-1", "分析这张照片的情绪与记忆", analysisExample)
    for
      first <- vision.analyze(jpegImage, prompt)
      second <- vision.analyze(jpegImage, prompt)
    yield
      assertEquals(first, second)
      assert(first.palette.nonEmpty, "样例必须带色板")
      assert(first.memoryCues.nonEmpty, "样例必须带记忆线索")
  }

  test("FakeVisionModel 的多张不同图片可以得到多样解读") {
    val vision = FakeVisionModel()
    val prompt = PhotoAnalysisPrompt("session-1", "分析照片", analysisExample)
    (0 until 12).toList.traverse { value =>
      vision.analyze(ImageBytes(Array(value.toByte), "image/jpeg"), prompt)
    }.map { analyses =>
      assertEquals(analyses.map(_.description).distinct.size, 12)
      assert(analyses.forall(_.suggestedCaption.nonEmpty))
    }
  }

  test("FakeReviewModel 返回固定五维分数与通过结论") {
    val prompt = ReviewPrompt("run-1", "评审两张截图", analysisExample)
    FakeReviewModel().review(prompt, List(jpegImage)).map { review =>
      assertEquals(review.scores, RubricScores(4, 4, 4, 4, 4))
      assertEquals(review.verdict, ReviewVerdict.Pass)
      assertEquals(review.issues, Nil)
      assert(review.summary.nonEmpty, "评审必须有一句话总结")
    }
  }

  test("FakeLocationModel 对同一图片给出确定性多候选（area + 仅名称）") {
    val location = FakeLocationModel()
    val prompt = LocationCandidatePrompt("session-1", "识别照片地点", analysisExample)
    for
      first <- location.suggestCandidates(jpegImage, prompt)
      second <- location.suggestCandidates(jpegImage, prompt)
    yield
      assertEquals(first, second)
      assert(first.candidates.size >= 2, "fake 应给出多候选")
      assert(first.candidates.exists(_.granularity.isDefined), "至少一条有坐标候选")
      assert(first.candidates.exists(_.granularity.isEmpty), "至少一条仅名称候选")
  }

  test("AiPorts.fake 四个端口均可直接使用") {
    val ports = AiPorts.fake
    for
      text <- ports.text.complete(TextPrompt("session-1", "写一句氛围描述"))
      analysis <- ports.vision.analyze(jpegImage, PhotoAnalysisPrompt("session-1", "分析照片", analysisExample))
      location <- ports.location.suggestCandidates(jpegImage, LocationCandidatePrompt("session-1", "识别地点", analysisExample))
      review <- ports.review.review(ReviewPrompt("run-1", "评审截图", analysisExample), List(jpegImage))
    yield
      assert(text.nonEmpty)
      assert(analysis.description.nonEmpty)
      assert(location.candidates.nonEmpty)
      assertEquals(review.verdict, ReviewVerdict.Pass)
  }
