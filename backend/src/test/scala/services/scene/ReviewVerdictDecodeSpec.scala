package services.scene

import io.circe.parser.parse
import io.circe.syntax.*

import munit.FunSuite

import services.scene.objects.*

/**
 * ReviewVerdict 的 verdict 解码容错（2026-10-28 live 实测：模型返回 fail，契约只接受 pass/revise）：
 * 大小写/空白/连字符规范化后兼容映射；未知值仍严格失败；Encoder 仍只输出小写 pass/revise。
 */
class ReviewVerdictDecodeSpec extends FunSuite:

  test("a) 兼容映射：pass 类 → Pass") {
    List("pass", "PASS", " Pass ", "passed", "ok", "approved").foreach { raw =>
      assertEquals(ReviewVerdict.fromString(raw), Right(ReviewVerdict.Pass), s"raw=$raw")
    }
  }

  test("b) 兼容映射：revise/fail 类 → Revise") {
    List(
      "revise",
      "REVISE",
      "fail",
      "FAIL",
      "failed",
      "rejected",
      "needs_revision",
      "needs revision",
      "needs-revision",
      "not_pass",
      "Not-Pass"
    ).foreach { raw =>
      assertEquals(ReviewVerdict.fromString(raw), Right(ReviewVerdict.Revise), s"raw=$raw")
    }
  }

  test("c) 未知值仍严格报错（不宽松）") {
    List("maybe", "", "  ", "通过", "不通过", "需修订", "unknown").foreach { raw =>
      assert(ReviewVerdict.fromString(raw).isLeft, s"raw=$raw 应失败")
    }
  }

  test("d) SceneReview 解码：真实日志 verdict=fail → Revise；Encoder 仍输出小写）") {
    val raw =
      """{"scores":{"moodMatch":4,"photoPresence":3,"composition":4,"lightingColor":4,"completeness":3},
        |"verdict":"FAIL","issues":["photoPresence｜画面右侧远景｜把第三张照片移近镜头"],"summary":"右侧远景偏小。"}""".stripMargin
    val decoded = parse(raw).flatMap(_.as[SceneReview])
    assertEquals(decoded.map(_.verdict), Right(ReviewVerdict.Revise))

    val encoded = decoded.toOption.get.asJson
    assertEquals(encoded.hcursor.get[String]("verdict").toOption, Some("revise"))

    val passEncoded = SceneReview(RubricScores(4, 4, 4, 4, 4), ReviewVerdict.Pass, Nil, "通过").asJson
    assertEquals(passEncoded.hcursor.get[String]("verdict").toOption, Some("pass"))
    assert(passEncoded.hcursor.get[String]("verdict").toOption.contains("pass"), "Encoder 不得输出大写或别名")
  }
