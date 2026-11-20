package services.system.ai

import io.circe.parser.parse

import munit.FunSuite

import services.curation.objects.PhotoAnalysis
import services.system.ai.objects.ImageBytes
import services.system.ai.openai.OpenAiWire

/** OpenAI 映射层单测（纯函数、无网络）：data URL、JSON 模式请求体、围栏剥离、usage 形状。 */
class OpenAiWireSuite extends FunSuite:

  private val image = ImageBytes(Array[Byte](1, 2, 3), "image/jpeg")

  test("dataUrl 生成 OpenAI 多模态 data URL") {
    assertEquals(OpenAiWire.dataUrl(image), "data:image/jpeg;base64,AQID")
  }

  test("requestBody 在 JSON 模式下带 response_format，普通模式不带") {
    val withJsonMode = OpenAiWire.requestBody("deepseek-v4.1-flash", List(OpenAiWire.userTextMessage("hi")), jsonMode = true)
    assertEquals(withJsonMode.hcursor.downField("response_format").get[String]("type").toOption, Some("json_object"))
    assertEquals(withJsonMode.hcursor.get[String]("model").toOption, Some("deepseek-v4.1-flash"))

    val withoutJsonMode = OpenAiWire.requestBody("deepseek-v4.1-flash", List(OpenAiWire.userTextMessage("hi")), jsonMode = false)
    assertEquals(withoutJsonMode.hcursor.downField("response_format").focus, None)
  }

  test("requestBody 透传 temperature，未设置时不出现该字段") {
    val withTemperature =
      OpenAiWire.requestBody("deepseek-v4.1-flash", List(OpenAiWire.userTextMessage("hi")), jsonMode = true, temperature = Some(0.3))
    assertEquals(withTemperature.hcursor.get[Double]("temperature").toOption, Some(0.3))

    val withoutTemperature =
      OpenAiWire.requestBody("deepseek-v4.1-flash", List(OpenAiWire.userTextMessage("hi")), jsonMode = true)
    assertEquals(withoutTemperature.hcursor.downField("temperature").focus, None)
  }

  test("requestBody 只在显式给出时带 reasoning_effort") {
    val messages = List(OpenAiWire.userTextMessage("hi"))
    val withEffort = OpenAiWire.requestBody("deepseek-v4.1-flash", messages, jsonMode = false, reasoningEffort = Some("low"))
    assertEquals(withEffort.hcursor.get[String]("reasoning_effort").toOption, Some("low"))
    assertEquals(OpenAiWire.requestBody("deepseek-v4.1-flash", messages, jsonMode = false).hcursor.downField("reasoning_effort").focus, None)
  }

  test("decodeStructured 能剥离 markdown 围栏后解码") {
    val raw =
      """```json
        |{"description":"d","mood":"m","palette":["#111111"],"memoryCues":["c"],"sensory":"s","suggestedCaption":"cap"}
        |```""".stripMargin
    val decoded = OpenAiWire.decodeStructured[PhotoAnalysis](raw)
    assert(decoded.isRight, s"应能解码，实际：$decoded")
    assertEquals(decoded.toOption.map(_.mood), Some("m"))
  }

  private val analysisJson =
    """{"description":"d","mood":"m","palette":["#111111"],"memoryCues":["c"],"sensory":"s","suggestedCaption":"cap"}"""

  test("decodeStructured：连续输出多个对象时取第一个能解码的（11-01 live：第 2 行才是完整结果）") {
    val raw = s"""{"mood":"草稿"}\n$analysisJson"""
    assertEquals(OpenAiWire.decodeStructured[PhotoAnalysis](raw).map(_.suggestedCaption), Right("cap"))
  }

  test("decodeStructured：JSON 前后夹带说明文字仍可解码，字符串里的括号不干扰定位") {
    val withBraces = analysisJson.replace("\"d\"", "\"门洞{圆形}与\\\"引号\\\"\"")
    val raw = s"评审如下：\n$withBraces\n以上。"
    assertEquals(OpenAiWire.decodeStructured[PhotoAnalysis](raw).map(_.description), Right("门洞{圆形}与\"引号\""))
  }

  test("decodeStructured：缺字段的错误带字段路径，便于从日志定位") {
    val decoded = OpenAiWire.decodeStructured[PhotoAnalysis]("""{"description":"d","mood":"m"}""")
    assert(decoded.left.exists(_.contains("palette")), s"错误应指出缺失字段：$decoded")
  }

  test("topLevelObjects：只返回顶层对象，嵌套对象不单独拆出") {
    assertEquals(OpenAiWire.topLevelObjects("""x {"a":{"b":1}} y {"c":"}"}"""), List("""{"a":{"b":1}}""", """{"c":"}"}"""))
  }

  test("usageSummary 读取 D1 冒烟实测的 usage 形状（只有 cost 与 opencode，无 allowance）") {
    val usageJson = parse(
      """{"cost":0.0009585,"opencode":{"billing_source":"balance","list_cost":0.0009585,
        |"tokens":{"input":495,"output":675,"reasoning":613}}}""".stripMargin
    ).toOption
    val usage = OpenAiWire.usageSummary(usageJson)
    assertEquals(usage.cost, Some(BigDecimal("0.0009585")))
    assertEquals(usage.billingSource, Some("balance"))
    assertEquals(usage.listCost, Some(BigDecimal("0.0009585")))
    assertEquals(usage.inputTokens, Some(495))
    assertEquals(usage.outputTokens, Some(675))
    assertEquals(usage.reasoningTokens, Some(613))
  }
