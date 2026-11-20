package services.system.routes

import cats.effect.IO
import cats.syntax.all.*
import fs2.Stream
import io.circe.Json
import org.http4s.Request
import org.http4s.circe.CirceEntityCodec.*

import services.system.api.{ApiError, ApiException}

/** JSON 传输边界；容量以 UTF-8 字节计，不依赖客户端 Content-Length。 */
object JsonRequestBody:

  /** reviewscene：四张 ≤2 MiB 截图的 base64 + JSON 总上限 12 MiB（api-contract §4.1）。 */
  val ReviewMaxBytes: Long = 12L * 1024 * 1024

  /** revisescene：请求体上限 2 MiB（api-contract v1.14 §4.2）。 */
  val RevisionMaxBytes: Long = 2L * 1024 * 1024

  def read(request: Request[IO], maxBytes: Long): IO[Json] =
    request.body.take(maxBytes + 1).compile.to(Array).flatMap { bytes =>
      if bytes.length.toLong > maxBytes then
        IO.raiseError(ApiException(ApiError.badRequest(s"请求体超过 $maxBytes 字节上限")))
      else
        request.withBodyStream(Stream.emits(bytes).covary[IO]).as[Json]
          .adaptError { case _ => ApiException(ApiError.badRequest("请求体不是合法 JSON")) }
    }
