package services.gallery.routes

import java.nio.file.Path
import java.util.UUID

import cats.effect.IO
import cats.syntax.all.*
import fs2.{Chunk, Stream}
import org.http4s.circe.CirceEntityCodec.*
import org.http4s.dsl.io.*
import org.http4s.headers.{Authorization, `Content-Type`}
import org.http4s.{AuthScheme, Credentials, HttpRoutes, MediaType, Request, Response, Status}
import org.slf4j.LoggerFactory
import scala.util.Try

import services.gallery.api.GetExhibitionCoverMessage
import services.gallery.objects.{ExhibitionId, PhotoContent}
import services.system.api.{ApiError, ApiException, ErrorCode, ErrorResponse}
import services.system.db.Database
import services.system.routes.TokenResolver

/** 封面字节路由（契约 §5.4，二进制边界固定例外）：内容类型解析后按原始字节响应。 */
object CoverRoutes:
  private val logger = LoggerFactory.getLogger(getClass)

  def routes(database: Database, dataDirectory: Path, resolveToken: TokenResolver): HttpRoutes[IO] =
    HttpRoutes.of[IO] { case request @ GET -> Root / "api" / "exhibitions" / rawExhibitionId / "cover" =>
      pipeline(request, rawExhibitionId, database, dataDirectory, resolveToken).attempt.flatMap(errorBoundary)
    }

  private def pipeline(
    request: Request[IO],
    rawExhibitionId: String,
    database: Database,
    dataDirectory: Path,
    resolveToken: TokenResolver
  ): IO[Response[IO]] =
    for
      exhibitionId <- parseExhibitionId(rawExhibitionId)
      response <- database.use { connection =>
                    for
                      userId <- bearerTokenOption(request).traverse(token => resolveToken.resolve(connection, token))
                      content <- GetExhibitionCoverMessage(userId, exhibitionId, dataDirectory).plan(connection)
                    yield binaryResponse(content)
                  }
    yield response

  private def parseExhibitionId(raw: String): IO[ExhibitionId] =
    Try(UUID.fromString(raw)).toOption match
      case Some(value) => IO.pure(ExhibitionId(value))
      case None => IO.raiseError(ApiException(ApiError.notFound("展览不存在")))

  private def bearerTokenOption(request: Request[IO]): Option[String] =
    request.headers.get[Authorization].flatMap { authorization =>
      authorization.credentials match
        case Credentials.Token(AuthScheme.Bearer, token) => Some(token)
        case _ => None
    }

  private[gallery] def binaryResponse(content: PhotoContent): Response[IO] =
    val mediaType = MediaType.parse(content.mimeType).getOrElse(MediaType.application.`octet-stream`)
    Response[IO](Status.Ok)
      .withBodyStream(Stream.chunk(Chunk.array(content.bytes)))
      .putHeaders(`Content-Type`(mediaType))

  private def errorBoundary(result: Either[Throwable, Response[IO]]): IO[Response[IO]] =
    result match
      case Right(response) => IO.pure(response)
      case Left(ApiException(error)) => IO.pure(errorResponse(error))
      case Left(error) =>
        IO(logger.error("封面字节路由执行失败", error)).as(errorResponse(ApiError.internal("服务器内部错误")))

  private def errorResponse(error: ApiError): Response[IO] =
    val status = Status.fromInt(ErrorCode.httpStatus(error.code)).getOrElse(Status.InternalServerError)
    Response[IO](status).withEntity(ErrorResponse(error))
