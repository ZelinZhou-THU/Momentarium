package services.system.ai.openai

import java.io.{BufferedReader, InputStream, InputStreamReader}
import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.concurrent.TimeoutException

import cats.Monad
import cats.effect.{IO, Ref, Resource}
import cats.syntax.all.*
import scala.concurrent.duration.FiniteDuration
import scala.jdk.OptionConverters.*

/**
 * 模型 HTTP 传输：JDK HttpClient。
 * - 非流式：每次都带 AI_WATCHDOG_MS 的请求超时。
 * - 流式（SSE）：AI_WATCHDOG_MS 管整次调用，另设“最长无数据间隔”；连接上一直有数据就不会被空闲清理掉。
 * 失败以 Either 返回（超时 vs 网络错误），由客户端决定是否重试；本层不含业务判断。
 */
private[ai] final class OpenAiHttpTransport(httpClient: HttpClient):

  def postChat(
    endpoint: URI,
    headers: Map[String, String],
    body: String,
    watchdog: FiniteDuration
  ): IO[Either[ChatFailure, ChatHttpResponse]] =
    val request = buildRequest(endpoint, headers, body, watchdog)
    IO.fromCompletableFuture(
      IO(httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)))
    ).attempt.map {
      case Right(response) =>
        Right(ChatHttpResponse(response.statusCode, response.body, firstHeader(response, "x-opencode-log-id")))
      case Left(error) => Left(failureOf(error))
    }

  /** 流式调用：逐行读完响应体后，把原文（状态码 + 所有行）交给调用方解析。 */
  def postChatStream(
    endpoint: URI,
    headers: Map[String, String],
    body: String,
    watchdog: FiniteDuration,
    idle: FiniteDuration
  ): IO[Either[ChatFailure, ChatHttpResponse]] =
    val request = buildRequest(endpoint, headers, body, watchdog)
    IO.fromCompletableFuture(
      IO(httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream()))
    ).flatMap(readStreamBody(_, idle))
      .timeout(watchdog)
      .attempt
      .map(_.left.map(failureOf))

  private def readStreamBody(response: HttpResponse[InputStream], idle: FiniteDuration): IO[ChatHttpResponse] =
    // 关闭的是底层字节流：读线程阻塞在 BufferedReader 上时，关闭 reader 会等同一把锁。
    Resource.fromAutoCloseable(IO(response.body)).use { stream =>
      val reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))
      IO.ref(0L).flatMap { receivedChars =>
        readLines(reader, idle, receivedChars)
          .handleErrorWith(error => receivedChars.get.flatMap(chars => IO.raiseError(StreamInterrupted(chars, error))))
          .map(lines => ChatHttpResponse(response.statusCode, lines.mkString("\n"), firstHeader(response, "x-opencode-log-id")))
      }
    }

  private def readLines(reader: BufferedReader, idle: FiniteDuration, receivedChars: Ref[IO, Long]): IO[Vector[String]] =
    Monad[IO].tailRecM(Vector.empty[String]) { lines =>
      IO.interruptible(Option(reader.readLine()))
        .timeoutAndForget(idle)
        .adaptError { case _: TimeoutException => StreamIdle(idle) }
        .flatMap {
          case None => IO.pure(Right(lines))
          case Some(line) => receivedChars.update(_ + line.length + 1).as(Left(lines :+ line))
        }
    }

  private def buildRequest(
    endpoint: URI,
    headers: Map[String, String],
    body: String,
    watchdog: FiniteDuration
  ): HttpRequest =
    val withHeaders = headers.foldLeft(
      HttpRequest
        .newBuilder(endpoint)
        .timeout(Duration.ofMillis(watchdog.toMillis))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
    ) { case (builder, (name, value)) => builder.header(name, value) }
    withHeaders.build()

  private def firstHeader(response: HttpResponse[?], name: String): Option[String] =
    response.headers.firstValue(name).toScala

  private def failureOf(error: Throwable): ChatFailure =
    if isTimeout(error) then ChatFailure.Timeout else ChatFailure.Network(describe(error))

  private def isTimeout(error: Throwable): Boolean =
    error match
      case _: java.net.http.HttpTimeoutException => true
      case _: java.util.concurrent.TimeoutException => true
      case other => Option(other.getCause).exists(isTimeout)

  private def describe(error: Throwable): String =
    Option(error.getMessage).filter(_.nonEmpty).getOrElse(error.getClass.getSimpleName)

  /** 流式响应超过 idle 没有收到任何数据：连接多半已被链路清掉，按网络失败处理（可重试）。 */
  private final case class StreamIdle(idle: FiniteDuration)
    extends RuntimeException(s"流式响应超过 ${idle.toMillis} 毫秒没有收到任何数据")

  /** 流读到一半出错：带上已收到的字符数，便于判断是一开始就断还是中途断。 */
  private final case class StreamInterrupted(receivedChars: Long, cause: Throwable)
    extends RuntimeException(s"${Option(cause.getMessage).filter(_.nonEmpty).getOrElse(cause.getClass.getSimpleName)}（已收到 $receivedChars 个字符后中断）", cause)

private[ai] object OpenAiHttpTransport:
  def create(): OpenAiHttpTransport =
    val httpClient = HttpClient
      .newBuilder()
      .connectTimeout(Duration.ofSeconds(30))
      .build()
    new OpenAiHttpTransport(httpClient)
