package services.scene

import io.circe.Json
import io.circe.parser.parse
import io.circe.syntax.*

import munit.FunSuite

import services.scene.objects.*

/**
 * SceneReview 的 issues 解码容错（2026-10-28 live 窗口实测问题）：
 * 模型自然倾向输出对象数组（`{"issue","fix"}` / `{"维度","证据","改法"}`），契约仍是字符串数组。
 * 解码器接受 a) 字符串数组、b) 对象数组、c) 混合数组，并归一化为「…｜…」字符串；
 * scores 与 issues 的非法形态仍按解码错误处理；verdict / summary 缺失时按 revise / 空摘要解码
 * （服务端会按分数重算这两项，2026-11-01 live 实测模型偶尔漏掉），出现但非法仍失败。
 */
class SceneReviewDecodeSpec extends FunSuite:

  private val scoresJson =
    """"scores":{"moodMatch":4,"photoPresence":3,"composition":4,"lightingColor":4,"completeness":3}"""

  private def reviewJson(issues: String): String =
    s"""{$scoresJson,"verdict":"revise","issues":$issues,"summary":"左前景与右侧远景需要调整。"}"""

  private def decodeRaw(raw: String): Either[io.circe.Error, SceneReview] =
    parse(raw).flatMap(_.as[SceneReview])

  test("a) 字符串数组原样解码（契约现状不回归）") {
    val result = decodeRaw(
      reviewJson(
        """["composition｜画面左侧｜压低前景礁石","photoPresence｜画面右侧远景｜把第三张照片移近镜头"]"""
      )
    )
    assertEquals(
      result.map(_.issues),
      Right(
        List(
          "composition｜画面左侧｜压低前景礁石",
          "photoPresence｜画面右侧远景｜把第三张照片移近镜头"
        )
      )
    )
    assertEquals(result.map(_.verdict), Right(ReviewVerdict.Revise))
  }

  test("b) 对象数组归一化：真实 live 两个样例（issue/fix 与中文字段名）") {
    val english = decodeRaw(reviewJson("""[{"issue":"远景把画框上半部裁切","fix":"把远处画框抬高"}]"""))
    assertEquals(english.map(_.issues), Right(List("远景把画框上半部裁切｜把远处画框抬高")))

    val chinese = decodeRaw(
      reviewJson("""[{"维度":"photoPresence","证据":"画面右侧远景照片过小","改法":"把第三张照片移近镜头"}]""")
    )
    assertEquals(chinese.map(_.issues), Right(List("photoPresence｜画面右侧远景照片过小｜把第三张照片移近镜头")))
  }

  test("c) 混合数组（string 与 object 混排）按顺序归一化") {
    val mixed = decodeRaw(
      reviewJson(
        """["moodMatch｜整体｜再加一点黄昏暖色",{"issue":"构图偏平","fix":"拉开前后景"},{"维度":"lightingColor","证据":"左前景过暗","改法":"补一盏侧光"}]"""
      )
    )
    assertEquals(
      mixed.map(_.issues),
      Right(
        List(
          "moodMatch｜整体｜再加一点黄昏暖色",
          "构图偏平｜拉开前后景",
          "lightingColor｜左前景过暗｜补一盏侧光"
        )
      )
    )
  }

  test("d) 其余字段与非法形态仍严格失败（不宽松）") {
    assert(decodeRaw(reviewJson("""[42]""")).isLeft, "数字元素应失败")
    assert(decodeRaw(reviewJson("""[{"issue":42}]""")).isLeft, "对象内无字符串值应失败")
    assert(decodeRaw(reviewJson("""[{}]""")).isLeft, "空对象应失败")
    assert(decodeRaw(reviewJson("""[["嵌套"]]""")).isLeft, "嵌套数组应失败")
    assert(decodeRaw("""{"scores":{"moodMatch":4},"verdict":"revise","issues":[],"summary":"x"}""").isLeft, "scores 缺字段应失败")
    assert(
      decodeRaw("""{"scores":{"moodMatch":4,"photoPresence":3,"composition":4,"lightingColor":4,"completeness":3},"verdict":"maybe","issues":[],"summary":"x"}""").isLeft,
      "verdict 非法应失败"
    )
    assert(
      decodeRaw("""{"scores":{"moodMatch":4,"photoPresence":3,"composition":4,"lightingColor":4,"completeness":3},"verdict":"revise","issues":[],"summary":123}""").isLeft,
      "summary 非字符串应失败"
    )
    assert(
      decodeRaw("""{"scores":{"moodMatch":4,"photoPresence":3,"composition":4,"lightingColor":4,"completeness":3},"verdict":"revise","summary":"x"}""").isLeft,
      "issues 缺失应失败"
    )
    assert(
      decodeRaw("""{"scores":{"moodMatch":4,"photoPresence":3,"composition":4,"lightingColor":4,"completeness":3},"verdict":"revise","issues":"x","summary":"x"}""").isLeft,
      "issues 非数组应失败"
    )
  }

  test("f) verdict / summary 缺失可解码（服务端重算），出现但非法仍失败") {
    val missingVerdict = decodeRaw(s"""{$scoresJson,"issues":["composition｜截图1｜圆门偏小"],"summary":"x"}""")
    assertEquals(missingVerdict.map(_.verdict), Right(ReviewVerdict.Revise))
    val missingSummary = decodeRaw(s"""{$scoresJson,"verdict":"revise","issues":[]}""")
    assertEquals(missingSummary.map(_.summary), Right(""))
    assert(decodeRaw(s"""{$scoresJson,"issues":[]}""").isRight, "两者都缺也可解码")
    assert(decodeRaw(s"""{$scoresJson,"verdict":"maybe","issues":[]}""").isLeft, "verdict 出现但非法仍失败")
    assert(decodeRaw(s"""{$scoresJson,"verdict":"revise","issues":[],"summary":1}""").isLeft, "summary 出现但非字符串仍失败")
  }

  test("e) 归一化后再编码：issues 仍是字符串数组（契约形状不变）") {
    val normalized = decodeRaw(
      reviewJson("""[{"issue":"远景把画框上半部裁切","fix":"把远处画框抬高"}]""")
    ).toOption.get
    val encoded = normalized.asJson
    val issues = encoded.hcursor.downField("issues").as[List[Json]].toOption.get
    assert(issues.forall(_.isString), "编码后 issues 必须全部是字符串")
    assertEquals(issues.flatMap(_.asString), List("远景把画框上半部裁切｜把远处画框抬高"))
  }
