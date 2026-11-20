package services.scene

import munit.FunSuite

import services.scene.utils.CodeSanitizer

/** 模型代码的基础清洗与结构校验（spec 9.3）：围栏/空/超限/入口/HTML。 */
class CodeSanitizerSpec extends FunSuite:

  private val validCode = "function build(ctx) { ctx.scene.add(new ctx.THREE.Object3D()); }"

  test("去掉 markdown 围栏后通过") {
    assertEquals(CodeSanitizer.sanitize("```js\n" + validCode + "\n```", 60), Right(validCode))
  }

  test("空代码被拒绝") {
    assert(CodeSanitizer.sanitize("   \n ", 60).isLeft)
  }

  test("超过大小上限被拒绝") {
    val oversized = validCode + "\n" + ("// padding\n" * 100)
    val result = CodeSanitizer.sanitize(oversized, 1)
    assert(result.isLeft, s"应拒绝超过 1KB 的代码，实际：$result")
  }

  test("缺少 function build(ctx) 入口被拒绝") {
    assert(CodeSanitizer.sanitize("const x = 1;", 60).isLeft)
  }

  test("夹带 HTML 片段被拒绝") {
    val htmlCode = "function build(ctx) { }\n<script>alert(1)</script>"
    val result = CodeSanitizer.sanitize(htmlCode, 60)
    assert(result.isLeft, s"应拒绝 HTML 片段，实际：$result")
  }

  test("合法代码通过且保留原文") {
    assertEquals(CodeSanitizer.sanitize("\n" + validCode + "\n", 60), Right(validCode))
  }
