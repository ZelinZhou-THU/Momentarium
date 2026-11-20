package services.gallery.routes

import java.nio.file.Path
import java.util.UUID

import cats.effect.{IO, Resource}
import io.circe.syntax.*
import org.http4s.circe.CirceEntityCodec.*
import org.http4s.dsl.io.*
import org.http4s.headers.Authorization
import org.http4s.multipart.Multipart
import org.http4s.{AuthScheme, Credentials, EntityDecoder, HttpRoutes, Request, Response, Status}
import org.slf4j.LoggerFactory
import scala.util.Try

import services.gallery.api.UploadCoverRenderMessage
import services.gallery.objects.{ExhibitionId, UploadCandidate}
import services.gallery.utils.{CoverRenderFiles, PhotoStorage}
import services.system.api.{ApiError, ApiException, ErrorCode, ErrorResponse}
import services.system.db.Database
import services.system.routes.TokenResolver

/** 场景渲染封面上传路由（契约 §5.3 的二进制边界）：multipart 解析与令牌转换在边界完成，业务在 plan。 */
object CoverRenderRoutes:
  private val logger = LoggerFactory.getLogger(getClass)
  private val FileField = "file"
  private val MultipartHeaderLimit = 8192
  private val MultipartPartMemoryThreshold = 512 * 1024
  private val MultipartMaximumParts = 4
  private val MultipartChunkSize = 8192

  def routes(database: Database, dataDirectory: Path, resolveToken: TokenResolver): HttpRoutes[IO] =
    HttpRoutes.of[IO] { case request @ POST -> Root / "api" / "exhibitions" / rawExhibitionId / "cover-render" =>
      pipeline(request, rawExhibitionId, database, dataDirectory, resolveToken).attempt.flatMap(errorBoundary)
    }

  /** multipart 解码器：超过阈值的 part 落到 http4s 临时文件，避免请求体整体进内存。 */
  private def multipartDecoder: Resource[IO, EntityDecoder[IO, Multipart[IO]]] =
    EntityDecoder.mixedMultipartResource[IO](
      headerLimit = MultipartHeaderLimit,
      maxSizeBeforeWrite = MultipartPartMemoryThreshold,
      maxParts = MultipartMaximumParts,
      failOnLimit = true,
      chunkSize = MultipartChunkSize
    )

  private def pipeline(
    request: Request[IO],
    rawExhibitionId: String,
    database: Database,
    dataDirectory: Path,
    resolveToken: TokenResolver
  ): IO[Response[IO]] =
    bearerTokenOption(request) match
      case None =>
        // 缺失令牌时先把请求体读完再返回 401，避免客户端写大 body 时收到连接重置。
        request.body.compile.drain *> IO.raiseError(ApiException(ApiError.unauthorized("请先登录")))
      case Some(token) =>
        PhotoStorage.temporaryDirectory.use { temporaryDirectory =>
          multipartDecoder.use { decoder =>
            for
              multipart <- decodeMultipart(decoder, request)
              candidate <- candidateOf(temporaryDirectory, multipart)
              exhibitionId <- parseExhibitionId(rawExhibitionId)
              uploadResponse <- database.use { connection =>
                                   for
                                     userId <- resolveToken.resolve(connection, token)
                                     response <- UploadCoverRenderMessage(
                                                   userId,
                                                   exhibitionId,
                                                   dataDirectory,
                                                   candidate
                                                 ).plan(connection)
                                   yield response
                                 }
            yield Response[IO](Status.Ok).withEntity(uploadResponse.asJson)
      }
    }

  private def decodeMultipart(decoder: EntityDecoder[IO, Multipart[IO]], request: Request[IO]): IO[Multipart[IO]] =
    decoder.decode(request, strict = true).value.flatMap {
      case Right(multipart) => IO.pure(multipart)
      case Left(_) => IO.raiseError(ApiException(ApiError.badRequest("multipart 请求解析失败")))
    }

  private def candidateOf(temporaryDirectory: Path, multipart: Multipart[IO]): IO[UploadCandidate] =
    multipart.parts.find(part => part.name.contains(FileField) && part.filename.isDefined) match
      case None => IO.raiseError(ApiException(ApiError.badRequest("缺少 file 文件字段")))
      case Some(part) =>
        for
          temporaryPath <- PhotoStorage.writeTemporaryFile(
                             temporaryDirectory,
                             part.body.take(CoverRenderFiles.MaxCoverBytes + 1)
                           )
        yield UploadCandidate(
          fileName = part.filename.getOrElse(""),
          declaredContentType = part.contentType.map(contentType =>
            s"${contentType.mediaType.mainType}/${contentType.mediaType.subType}"
          ),
          temporaryPath = temporaryPath
        )

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

  private def errorBoundary(result: Either[Throwable, Response[IO]]): IO[Response[IO]] =
    result match
      case Right(response) => IO.pure(response)
      case Left(ApiException(error)) => IO.pure(errorResponse(error))
      case Left(error) =>
        IO(logger.error("渲染封面上传路由执行失败", error)).as(errorResponse(ApiError.internal("服务器内部错误")))

  private def errorResponse(error: ApiError): Response[IO] =
    val status = Status.fromInt(ErrorCode.httpStatus(error.code)).getOrElse(Status.InternalServerError)
    Response[IO](status).withEntity(ErrorResponse(error))
