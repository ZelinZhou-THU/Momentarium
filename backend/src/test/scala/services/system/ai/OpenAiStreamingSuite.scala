package services.system.ai

import java.io.OutputStream
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.{ConcurrentLinkedQueue, Executors}
import java.util.concurrent.atomic.AtomicInteger

import scala.concurrent.duration.*

import cats.effect.{IO, Resource}
import com.sun.net.httpserver.{HttpExchange, HttpServer}
import munit.CatsEffectSuite

import services.system.ai.objects.TextPrompt
import services.system.ai.openai.{OpenAiChatClient, OpenAiHttpTransport, OpenAiWire}
import services.system.api.ApiException
import services.system.config.{AiConfig, AiMode, AiProtocol}

/**
 * 流式（SSE）调用：纯解析 + 本地假网关。
 * 本地假网关复现线上故障形态——无数据空闲、读到一半断开、网关 5xx——验证流式在这些情形下的行为，不发任何真实请求。
 */
class OpenAiStreamingSuite extends CatsEffectSuite:

  // ---------- 纯解析：SSE 原文 → Completion ----------

  private def chunk(content: String, finish: Option[String] = None): String =
    val finishJson = finish.fold("null")(reason => "\"" + reason + "\"")
    s"""data: {"model":"deepseek-v4.1-flash","choices":[{"index":0,"delta":{"content":"$content"},"finish_reason":$finishJson}]}"""

  private val usageChunk =
    """data: {"choices":[],"usage":{"cost":"0","opencode":{"billing_source":"go","list_cost":"0.0021","tokens":{"input":10,"output":20,"reasoning":5}}}}"""

  test("requestBody：流式请求带 stream=true 与 include_usage，非流式不带 stream_options") {
    val messages = List(OpenAiWire.userTextMessage("hi"))
    val streaming = OpenAiWire.requestBody("m", messages, jsonMode = false, stream = true)
    assertEquals(streaming.hcursor.get[Boolean]("stream").toOption, Some(true))
    assertEquals(streaming.hcursor.downField("stream_options").get[Boolean]("include_usage").toOption, Some(true))
    val plain = OpenAiWire.requestBody("m", messages, jsonMode = false)
    assertEquals(plain.hcursor.get[Boolean]("stream").toOption, Some(false))
    assertEquals(plain.hcursor.downField("stream_options").focus, None)
  }

  test("streamCompletion：拼接 content 增量，忽略推理增量、注释行与空行，usage 取末尾数据块") {
    val raw = List(
      ": keep-alive",
      """data: {"choices":[{"delta":{"reasoning_content":"先想一想"},"finish_reason":null}]}""",
      "",
      chunk("function build"),
      chunk("(ctx) { /* 山 */ }", Some("stop")),
      usageChunk,
      "data: [DONE]"
    ).mkString("\n")
    val completion = OpenAiWire.streamCompletion(raw).fold(error => fail(error.toString), identity)
    assertEquals(completion.content, "function build(ctx) { /* 山 */ }")
    assertEquals(completion.finishReason, Some("stop"))
    assertEquals(completion.model, Some("deepseek-v4.1-flash"))
    val usage = OpenAiWire.usageSummary(completion.usage)
    assertEquals(usage.billingSource, Some("go"))
    assertEquals(usage.reasoningTokens, Some(5))
  }

  test("streamCompletion：只有 finish_reason、没有 [DONE] 也算完整（usage 缺失不影响内容）") {
    val completion = OpenAiWire.streamCompletion(chunk("ok", Some("stop"))).fold(error => fail(error.toString), identity)
    assertEquals(completion.content, "ok")
    assertEquals(completion.usage, None)
  }

  test("streamCompletion：既无 finish_reason 也无 [DONE] 是被截断，不能当成功") {
    val raw = List(chunk("function build(ctx) {"), chunk(" const a = 1;")).mkString("\n")
    assertEquals(OpenAiWire.streamCompletion(raw), Left(OpenAiWire.StreamError.Truncated("function build(ctx) { const a = 1;".length)))
  }

  test("streamCompletion：数据块里带 error、或不是合法 JSON，都是内容无效而不是截断") {
    val withError = List(chunk("part"), """data: {"error":{"message":"upstream overloaded"}}""").mkString("\n")
    assert(OpenAiWire.streamCompletion(withError).left.exists(_.isInstanceOf[OpenAiWire.StreamError.Invalid]))
    assert(OpenAiWire.streamCompletion("data: {not json").left.exists(_.isInstanceOf[OpenAiWire.StreamError.Invalid]))
  }

  test("streamCompletion：网关没按流返回、直接给整段 JSON 时，按非流式解析兜底") {
    val plainJson = """{"model":"m","choices":[{"message":{"content":"整段内容"},"finish_reason":"stop"}]}"""
    assertEquals(OpenAiWire.streamCompletion(plainJson).map(_.content), Right("整段内容"))
  }

  // ---------- 本地假网关：空闲、断开、5xx 与持续有数据 ----------

  private def bytesOf(text: String): Array[Byte] = text.getBytes(StandardCharsets.UTF_8)

  private def writeFlush(out: OutputStream, bytes: Array[Byte]): Unit =
    out.write(bytes)
    out.flush()

  private def sse(exchange: HttpExchange)(writeBody: OutputStream => Unit): Unit =
    exchange.getResponseHeaders.add("Content-Type", "text/event-stream")
    exchange.sendResponseHeaders(200, 0)
    val out = exchange.getResponseBody
    writeBody(out)
    out.close()

  private def reject(exchange: HttpExchange, status: Int): Unit =
    exchange.sendResponseHeaders(status, -1)
    exchange.close()

  private final case class Gateway(baseUrl: String, calls: AtomicInteger, bodies: ConcurrentLinkedQueue[String])

  /** behaviour(第几次请求, exchange) 决定每次怎么响应。 */
  private def gateway(behaviour: (Int, HttpExchange) => Unit): Resource[IO, Gateway] =
    Resource
      .make(IO {
        val calls = new AtomicInteger(0)
        val bodies = new ConcurrentLinkedQueue[String]()
        val server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0)
        server.setExecutor(Executors.newCachedThreadPool())
        server.createContext(
          "/openai/v1/chat/completions",
          (exchange: HttpExchange) =>
            bodies.add(new String(exchange.getRequestBody.readAllBytes(), StandardCharsets.UTF_8))
            behaviour(calls.incrementAndGet(), exchange)
        )
        server.start()
        (server, Gateway(s"http://127.0.0.1:${server.getAddress.getPort}", calls, bodies))
      })(handle => IO(handle._1.stop(0)))
      .map(_._2)

  private def configFor(baseUrl: String, idle: FiniteDuration): AiConfig =
    AiConfig(
      mode = AiMode.Live,
      baseUrl = baseUrl,
      apiKey = Some("test-key"),
      textModel = "m",
      codeModel = "m",
      visionModel = "m",
      reviewModel = "m",
      textProtocol = AiProtocol.OpenAi,
      visionProtocol = AiProtocol.OpenAi,
      userAgent = "Momentarium/test",
      watchdog = 30.seconds,
      streamIdle = idle
    )

  private def complete(baseUrl: String, idle: FiniteDuration): IO[String] =
    OpenAiChatClient.using(configFor(baseUrl, idle), "test-key", OpenAiHttpTransport.create()).complete(TextPrompt("s", "写代码"))

  private val happyBody: OutputStream => Unit = out =>
    List(chunk("function build"), chunk("(ctx) {}", Some("stop")), usageChunk, "data: [DONE]")
      .foreach(line => writeFlush(out, bytesOf(line + "\n\n")))

  test("流式：整段读完并拼出内容，请求体带 stream=true") {
    gateway((_, exchange) => sse(exchange)(happyBody)).use { gw =>
      complete(gw.baseUrl, 5.seconds).map { text =>
        assertEquals(text, "function build(ctx) {}")
        assertEquals(gw.calls.get, 1)
        assert(gw.bodies.peek.contains("\"stream\":true"), gw.bodies.peek)
        assert(gw.bodies.peek.contains("\"reasoning_effort\":\"max\""), gw.bodies.peek)
      }
    }
  }

  test("流式：中文字符被拆在两个 TCP 数据块中间也能还原") {
    val line = bytesOf(chunk("山海") + "\n\n")
    val splitAt = bytesOf(chunk("山海").substring(0, chunk("山海").indexOf("山"))).length + 1 // 山 的 3 个字节只先发 1 个
    val body: OutputStream => Unit = out =>
      writeFlush(out, line.take(splitAt))
      Thread.sleep(150)
      writeFlush(out, line.drop(splitAt))
      writeFlush(out, bytesOf(chunk("", Some("stop")) + "\n\ndata: [DONE]\n\n"))
    gateway((_, exchange) => sse(exchange)(body)).use(gw => complete(gw.baseUrl, 5.seconds).map(assertEquals(_, "山海")))
  }

  test("流式：总时长远超空闲上限，只要持续有数据就不会被判空闲") {
    val body: OutputStream => Unit = out =>
      (1 to 6).foreach { index =>
        writeFlush(out, bytesOf(chunk(s"$index,") + "\n\n"))
        Thread.sleep(200)
      }
      writeFlush(out, bytesOf(chunk("end", Some("stop")) + "\n\ndata: [DONE]\n\n"))
    gateway((_, exchange) => sse(exchange)(body)).use { gw =>
      complete(gw.baseUrl, 600.millis).map { text =>
        assertEquals(text, "1,2,3,4,5,6,end")
        assertEquals(gw.calls.get, 1)
      }
    }
  }

  test("流式：先发一点数据后连接空闲，超过空闲上限即判网络失败并重试，第二次成功") {
    gateway { (attempt, exchange) =>
      if attempt == 1 then
        sse(exchange) { out =>
          writeFlush(out, bytesOf(chunk("half") + "\n\n"))
          Thread.sleep(3000)
        }
      else sse(exchange)(happyBody)
    }.use { gw =>
      complete(gw.baseUrl, 500.millis).map { text =>
        assertEquals(text, "function build(ctx) {}")
        assertEquals(gw.calls.get, 2)
      }
    }
  }

  test("流式：读到一半对端正常关闭（没有结束标记）视为截断并重试") {
    gateway { (attempt, exchange) =>
      if attempt == 1 then sse(exchange)(out => writeFlush(out, bytesOf(chunk("function build(ctx) {") + "\n\n")))
      else sse(exchange)(happyBody)
    }.use { gw =>
      complete(gw.baseUrl, 5.seconds).map { text =>
        assertEquals(text, "function build(ctx) {}")
        assertEquals(gw.calls.get, 2)
      }
    }
  }

  test("流式：网关先返回 503，退避后重试成功") {
    gateway((attempt, exchange) => if attempt == 1 then reject(exchange, 503) else sse(exchange)(happyBody)).use { gw =>
      complete(gw.baseUrl, 5.seconds).map { text =>
        assertEquals(text, "function build(ctx) {}")
        assertEquals(gw.calls.get, 2)
      }
    }
  }

  test("流式：网关始终 503，重试用尽后以 MODEL_FAILURE 失败") {
    gateway((_, exchange) => reject(exchange, 503)).use { gw =>
      complete(gw.baseUrl, 5.seconds).attempt.map { result =>
        assert(result.left.exists(_.isInstanceOf[ApiException]), result.toString)
        assertEquals(gw.calls.get, 3)
      }
    }
  }
