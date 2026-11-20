package services.system.ai.openai

import java.util.Base64

import io.circe.{CursorOp, Decoder, Json}
import io.circe.parser.parse

import services.system.ai.objects.{
  ImageBytes,
  LocationCandidatePrompt,
  PhotoAnalysisPrompt,
  ReviewPrompt,
  StructuredPrompt,
  TextPrompt
}

/**
 * OpenAI Chat Completions 的请求/响应映射（纯函数，不发网络请求）。
 * 结构对齐 D1 冒烟实测：usage.opencode = {billing_source, list_cost, tokens}，顶层 usage.cost；无 allowance 字段。
 */
private[ai] object OpenAiWire:

  /** 结构化输出优先使用的 JSON 模式（冒烟已确认网关支持）。 */
  val jsonObjectResponseFormat: Json = Json.obj("type" -> Json.fromString("json_object"))

  /** 重试时追加的用户提示：带上首次失败的原因，让模型知道具体错在哪里。 */
  def jsonOnlyInstruction(previousFailure: String): Json =
    userTextMessage(
      s"上一次输出无法使用：$previousFailure。请重新输出：只输出一个 JSON 对象，不要 markdown 围栏、不要任何解释；" +
        "字段与类型必须与上面的 JSON 形状示例完全一致，示例中的每个字段都必须出现。"
    )

  final case class Completion(
    content: String,
    model: Option[String],
    finishReason: Option[String],
    usage: Option[Json]
  )

  final case class UsageSummary(
    cost: Option[BigDecimal],
    billingSource: Option[String],
    listCost: Option[BigDecimal],
    inputTokens: Option[Int],
    outputTokens: Option[Int],
    reasoningTokens: Option[Int]
  )

  object UsageSummary:
    val empty: UsageSummary = UsageSummary(None, None, None, None, None, None)

  def systemMessage(content: String): Json =
    Json.obj("role" -> Json.fromString("system"), "content" -> Json.fromString(content))

  def userTextMessage(content: String): Json =
    Json.obj("role" -> Json.fromString("user"), "content" -> Json.fromString(content))

  def userVisionMessage(content: String, images: List[ImageBytes]): Json =
    val parts = Json.obj("type" -> Json.fromString("text"), "text" -> Json.fromString(content)) :: images.map(imagePart)
    Json.obj("role" -> Json.fromString("user"), "content" -> Json.arr(parts*))

  def imagePart(image: ImageBytes): Json =
    Json.obj(
      "type" -> Json.fromString("image_url"),
      "image_url" -> Json.obj("url" -> Json.fromString(dataUrl(image)))
    )

  def dataUrl(image: ImageBytes): String =
    s"data:${image.mimeType};base64,${Base64.getEncoder.encodeToString(image.bytes)}"

  def requestBody(
    model: String,
    messages: List[Json],
    jsonMode: Boolean,
    temperature: Option[Double] = None,
    reasoningEffort: Option[String] = None,
    stream: Boolean = false
  ): Json =
    val base = Json.obj(
      "model" -> Json.fromString(model),
      "messages" -> Json.arr(messages*),
      "stream" -> Json.fromBoolean(stream)
    )
    val body =
      if stream then base.deepMerge(Json.obj("stream_options" -> Json.obj("include_usage" -> Json.True))) else base
    val withJsonMode = if jsonMode then body.deepMerge(Json.obj("response_format" -> jsonObjectResponseFormat)) else body
    val withTemperature =
      temperature.fold(withJsonMode)(value => withJsonMode.deepMerge(Json.obj("temperature" -> Json.fromDoubleOrNull(value))))
    reasoningEffort.fold(withTemperature)(value => withTemperature.deepMerge(Json.obj("reasoning_effort" -> Json.fromString(value))))

  def textMessages(prompt: TextPrompt): List[Json] =
    prompt.system.map(systemMessage).toList :+ userTextMessage(prompt.instructions)

  def structuredMessages(prompt: StructuredPrompt): List[Json] =
    prompt.system.map(systemMessage).toList :+ userTextMessage(withShapeExample(prompt.instructions, prompt.responseExample))

  def photoAnalysisMessages(prompt: PhotoAnalysisPrompt, image: ImageBytes): List[Json] =
    prompt.system.map(systemMessage).toList :+ userVisionMessage(withShapeExample(prompt.instructions, prompt.responseExample), List(image))

  def locationMessages(prompt: LocationCandidatePrompt, image: ImageBytes): List[Json] =
    prompt.system.map(systemMessage).toList :+ userVisionMessage(withShapeExample(prompt.instructions, prompt.responseExample), List(image))

  def reviewMessages(prompt: ReviewPrompt, captures: List[ImageBytes]): List[Json] =
    prompt.system.map(systemMessage).toList :+ userVisionMessage(withShapeExample(prompt.instructions, prompt.responseExample), captures)

  /** 把 JSON 形状示例拼进用户提示，让模型对齐字段与类型（同时也是 fake 实现的确定性返回）。 */
  def withShapeExample(instructions: String, responseExample: Json): String =
    s"$instructions\n\nJSON 形状示例（字段名与类型必须一致）：\n${responseExample.noSpaces}"

  def completion(rawBody: String): Either[String, Completion] =
    parse(rawBody).left.map(error => s"响应不是合法 JSON：${error.message}").flatMap { json =>
      val cursor = json.hcursor
      val choice = cursor.downField("choices").downArray
      val content = choice.downField("message").downField("content").as[String].toOption.map(_.trim).getOrElse("")
      if content.isEmpty then Left("模型响应缺少非空 choices[0].message.content")
      else
        Right(
          Completion(
            content = content,
            model = cursor.get[String]("model").toOption,
            finishReason = choice.get[String]("finish_reason").toOption,
            usage = cursor.downField("usage").focus.filterNot(_.isNull)
          )
        )
    }

  /** 流式响应的两类失败：没收到结束标记就断了（可重试的网络问题），或内容本身不可用。 */
  enum StreamError:
    case Truncated(receivedChars: Int)
    case Invalid(reason: String)

  private final case class StreamState(
    content: Vector[String],
    model: Option[String],
    finishReason: Option[String],
    usage: Option[Json],
    done: Boolean,
    unparsed: Vector[String]
  )

  private val emptyStream: StreamState = StreamState(Vector.empty, None, None, None, false, Vector.empty)

  /**
   * 把 SSE 原文（逐行 `data: {...}`，以 `data: [DONE]` 或 finish_reason 收尾）还原成与非流式等价的 Completion。
   * 只拼 delta.content，推理增量忽略；usage 取最后一个非空值（include_usage 的末尾数据块）。
   * 网关若直接回了整段 JSON（未按流返回），按非流式解析兜底。
   */
  def streamCompletion(rawStream: String): Either[StreamError, Completion] =
    rawStream.linesIterator
      .map(_.trim)
      .foldLeft[Either[StreamError, StreamState]](Right(emptyStream))((state, line) => state.flatMap(foldStreamLine(_, line)))
      .flatMap(finishStream)

  private def foldStreamLine(state: StreamState, line: String): Either[StreamError, StreamState] =
    if line.isEmpty || line.startsWith(":") || List("event:", "id:", "retry:").exists(line.startsWith) then Right(state)
    else if line.startsWith("data:") then foldStreamData(state, line.stripPrefix("data:").trim)
    else Right(state.copy(unparsed = state.unparsed :+ line))

  private def foldStreamData(state: StreamState, payload: String): Either[StreamError, StreamState] =
    if payload == "[DONE]" then Right(state.copy(done = true))
    else
      parse(payload).left.map(error => StreamError.Invalid(s"流式数据块不是合法 JSON：${error.message}")).flatMap { json =>
        val cursor = json.hcursor
        if cursor.downField("error").succeeded then
          Left(StreamError.Invalid(s"流式响应中途返回错误：${errorExcerpt(payload, 300)}"))
        else
          val choice = cursor.downField("choices").downArray
          Right(
            state.copy(
              content = state.content ++ choice.downField("delta").get[String]("content").toOption,
              model = cursor.get[String]("model").toOption.orElse(state.model),
              finishReason = choice.get[String]("finish_reason").toOption.orElse(state.finishReason),
              usage = cursor.downField("usage").focus.filterNot(_.isNull).orElse(state.usage)
            )
          )
      }

  private def finishStream(state: StreamState): Either[StreamError, Completion] =
    val text = state.content.mkString.trim
    if text.isEmpty && state.unparsed.nonEmpty then
      completion(state.unparsed.mkString("\n")).left.map(StreamError.Invalid(_))
    else if !state.done && state.finishReason.isEmpty then Left(StreamError.Truncated(text.length))
    else if text.isEmpty then Left(StreamError.Invalid("流式响应没有任何 content 增量"))
    else Right(Completion(text, state.model, state.finishReason, state.usage))

  def usageSummary(usage: Option[Json]): UsageSummary =
    usage.filterNot(_.isNull) match
      case None => UsageSummary.empty
      case Some(json) =>
        val cursor = json.hcursor
        val opencode = cursor.downField("opencode")
        val tokens = opencode.downField("tokens")
        UsageSummary(
          cost = cursor.get[BigDecimal]("cost").toOption,
          billingSource = opencode.get[String]("billing_source").toOption,
          listCost = opencode.get[BigDecimal]("list_cost").toOption,
          inputTokens = tokens.get[Int]("input").toOption,
          outputTokens = tokens.get[Int]("output").toOption,
          reasoningTokens = tokens.get[Int]("reasoning").toOption
        )

  /**
   * 解码结构化输出：先按整体解析；不成立时（模型在 JSON 前后夹了说明、或连续输出多个对象），
   * 依次尝试文本中每个顶层 JSON 对象，取第一个能解码为 A 的。都不成立时报告整体解析的原因。
   */
  def decodeStructured[A: Decoder](text: String): Either[String, A] =
    val stripped = stripJsonFences(text)
    val whole = decodeJson[A](stripped)
    whole.left.flatMap(wholeFailure =>
      topLevelObjects(stripped)
        .filterNot(_ == stripped)
        .map(decodeJson[A])
        .collectFirst { case Right(value) => value }
        .toRight(wholeFailure)
    )

  private def decodeJson[A: Decoder](text: String): Either[String, A] =
    parse(text)
      .left.map(error => s"模型输出不是合法 JSON：${error.message}")
      .flatMap(json =>
        summon[Decoder[A]]
          .decodeJson(json)
          .left.map(failure => s"${failure.message}（位置 ${CursorOp.opsToPath(failure.history)}）")
      )

  /** 文本中所有顶层 `{…}` 片段（跳过字符串字面量里的括号与转义），按出现顺序返回。 */
  def topLevelObjects(text: String): List[String] =
    final case class Scan(depth: Int, inString: Boolean, escaped: Boolean, start: Int, found: List[String])
    text.zipWithIndex
      .foldLeft(Scan(0, inString = false, escaped = false, start = -1, Nil)) { case (scan, (char, index)) =>
        if scan.inString then
          if scan.escaped then scan.copy(escaped = false)
          else if char == '\\' then scan.copy(escaped = true)
          else if char == '"' then scan.copy(inString = false)
          else scan
        else
          char match
            case '"' if scan.depth > 0 => scan.copy(inString = true)
            case '{' if scan.depth == 0 => scan.copy(depth = 1, start = index)
            case '{' => scan.copy(depth = scan.depth + 1)
            case '}' if scan.depth == 1 => scan.copy(depth = 0, found = text.substring(scan.start, index + 1) :: scan.found)
            case '}' if scan.depth > 1 => scan.copy(depth = scan.depth - 1)
            case _ => scan
      }
      .found
      .reverse

  /** 模型偶尔仍会加 markdown 围栏；解析前统一去掉。 */
  def stripJsonFences(text: String): String =
    text.trim.replaceFirst("(?s)^```[a-zA-Z]*\\s*", "").replaceFirst("(?s)\\s*```$", "").trim

  def errorExcerpt(rawBody: String, limit: Int): String =
    val compact = rawBody.replaceAll("\\s+", " ").trim
    if compact.length <= limit then compact else s"${compact.take(limit)}…"
