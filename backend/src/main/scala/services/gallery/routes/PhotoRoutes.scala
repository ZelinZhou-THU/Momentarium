package services.gallery.routes

import java.nio.charset.StandardCharsets
import java.nio.file.Path
import java.util.UUID

import cats.effect.{IO, Resource}
import cats.syntax.all.*
import io.circe.syntax.*
import org.http4s.circe.CirceEntityCodec.*
import org.http4s.dsl.io.*
import org.http4s.headers.{Authorization, `Content-Type`}
import org.http4s.multipart.{Multipart, Part}
import org.http4s.{AuthScheme, Credentials, EntityDecoder, HttpRoutes, MediaType, Request, Response, Status}
import org.slf4j.LoggerFactory
import scala.util.Try

import services.gallery.api.{ContributionUploadMessage, GetContributionContentMessage, GetPhotoContentMessage, UploadPhotosMessage}
import services.gallery.objects.{ContributionId, ExhibitionId, PhotoContent, PhotoId, PhotoVariant, UploadCandidate}
import services.gallery.utils.PhotoStorage
import services.system.api.{ApiError, ApiException, ErrorCode, ErrorResponse}
import services.system.config.ContributionConfig
import services.system.db.Database
import services.system.routes.TokenResolver

/** 照片与投稿的二进制资源路由（spec §6.4/§8.4 的固定例外）：multipart 解析、令牌转换与字节响应在边界完成，
  * 业务在 plan。照片两条路由：POST /api/photos/upload、GET /api/photos/{photoId}/content?variant=thumb|full；
  * 投稿两条路由：POST /api/contributions/upload、GET /api/contributions/{contributionId}/content?variant=thumb|full。
  * 它们不进入消息路由器（不注册 GalleryRoutes），但业务逻辑仍由 API 消息的 plan 承载，保持路由精简。 */
object PhotoRoutes:
  private val logger = LoggerFactory.getLogger(getClass)
  private val ExhibitionIdField = "exhibitionId"
  private val ContributionIdField = "contributionId"
  private val FilesField = "files"
  private val VariantParameter = "variant"
  private val MultipartHeaderLimit = 8192
  private val MultipartPartMemoryThreshold = 1024 * 1024
  private val MultipartMaximumParts = 40
  private val MultipartChunkSize = 8192

  def routes(
    database: Database,
    dataDirectory: Path,
    contributionConfig: ContributionConfig,
    resolveToken: TokenResolver
  ): HttpRoutes[IO] =
    HttpRoutes.of[IO] {
      case request @ POST -> Root / "api" / "photos" / "upload" =>
        handleUpload(request, database, dataDirectory, resolveToken)
      case request @ POST -> Root / "api" / "contributions" / "upload" =>
        handleContributionUpload(request, database, dataDirectory, contributionConfig, resolveToken)
      case request @ GET -> Root / "api" / "photos" / rawPhotoId / "content" =>
        handleContent(request, rawPhotoId, database, dataDirectory, resolveToken)
      case request @ GET -> Root / "api" / "contributions" / rawContributionId / "content" =>
        handleContributionContent(request, rawContributionId, database, dataDirectory, resolveToken)
    }

  /** multipart 解码器：超过阈值的 part 落到 http4s 临时文件，避免整批请求体进内存。 */
  private def multipartDecoder: Resource[IO, EntityDecoder[IO, Multipart[IO]]] =
    EntityDecoder.mixedMultipartResource[IO](
      headerLimit = MultipartHeaderLimit,
      maxSizeBeforeWrite = MultipartPartMemoryThreshold,
      maxParts = MultipartMaximumParts,
      failOnLimit = true,
      chunkSize = MultipartChunkSize
    )

  private def handleUpload(
    request: Request[IO],
    database: Database,
    dataDirectory: Path,
    resolveToken: TokenResolver
  ): IO[Response[IO]] =
    uploadPipeline(request, database, dataDirectory, resolveToken).attempt.flatMap(errorBoundary)

  private def uploadPipeline(
    request: Request[IO],
    database: Database,
    dataDirectory: Path,
    resolveToken: TokenResolver
  ): IO[Response[IO]] =
    PhotoStorage.temporaryDirectory.use { temporaryDirectory =>
      multipartDecoder.use { decoder =>
        for
          multipart <- decodeMultipart(decoder, request)
          exhibitionId <- exhibitionIdOf(multipart)
          candidates <- candidatesOf(temporaryDirectory, multipart, UploadPhotosMessage.MaxFileBytes)
          response <- executeUpload(request, database, dataDirectory, resolveToken, exhibitionId, candidates)
        yield response
      }
    }

  private def handleContributionUpload(
    request: Request[IO],
    database: Database,
    dataDirectory: Path,
    contributionConfig: ContributionConfig,
    resolveToken: TokenResolver
  ): IO[Response[IO]] =
    contributionUploadPipeline(request, database, dataDirectory, contributionConfig, resolveToken)
      .attempt
      .flatMap(errorBoundary)

  private def contributionUploadPipeline(
    request: Request[IO],
    database: Database,
    dataDirectory: Path,
    contributionConfig: ContributionConfig,
    resolveToken: TokenResolver
  ): IO[Response[IO]] =
    PhotoStorage.temporaryDirectory.use { temporaryDirectory =>
      multipartDecoder.use { decoder =>
        for
          multipart <- decodeMultipart(decoder, request)
          exhibitionId <- exhibitionIdOf(multipart)
          contributionId <- contributionIdOf(multipart)
          candidates <- candidatesOf(temporaryDirectory, multipart, contributionConfig.maxFileBytes)
          response <- executeContributionUpload(
                        request,
                        database,
                        dataDirectory,
                        contributionConfig,
                        resolveToken,
                        exhibitionId,
                        contributionId,
                        candidates
                      )
        yield response
      }
    }

  private def decodeMultipart(decoder: EntityDecoder[IO, Multipart[IO]], request: Request[IO]): IO[Multipart[IO]] =
    decoder.decode(request, strict = true).value.flatMap {
      case Right(multipart) => IO.pure(multipart)
      case Left(_) => IO.raiseError(ApiException(ApiError.badRequest("multipart 请求解析失败")))
    }

  private def exhibitionIdOf(multipart: Multipart[IO]): IO[ExhibitionId] =
    multipart.parts.find(part => part.name.contains(ExhibitionIdField) && part.filename.isEmpty) match
      case None => IO.raiseError(ApiException(ApiError.badRequest("缺少 exhibitionId 字段")))
      case Some(part) =>
        for
          bytes <- part.body.compile.to(Array)
          exhibitionId <- parseExhibitionId(new String(bytes, StandardCharsets.UTF_8).trim)
        yield exhibitionId

  private def contributionIdOf(multipart: Multipart[IO]): IO[Option[ContributionId]] =
    multipart.parts.find(part => part.name.contains(ContributionIdField) && part.filename.isEmpty) match
      case None => IO.pure(None)
      case Some(part) =>
        for
          bytes <- part.body.compile.to(Array)
          raw = new String(bytes, StandardCharsets.UTF_8).trim
          contributionId <- if raw.isEmpty then IO.pure(None) else parseContributionId(raw).map(Some(_))
        yield contributionId

  private def candidatesOf(temporaryDirectory: Path, multipart: Multipart[IO], maxFileBytes: Long): IO[List[UploadCandidate]] =
    val fileParts = multipart.parts.filter(part => part.name.contains(FilesField) && part.filename.isDefined)
    if fileParts.isEmpty then IO.raiseError(ApiException(ApiError.badRequest("缺少 files 文件字段")))
    else fileParts.toList.traverse(part => storeCandidate(temporaryDirectory, part, maxFileBytes))

  private def storeCandidate(temporaryDirectory: Path, part: Part[IO], maxFileBytes: Long): IO[UploadCandidate] =
    for
      temporaryPath <- PhotoStorage.writeTemporaryFile(
                         temporaryDirectory,
                         part.body.take(maxFileBytes + 1)
                       )
    yield UploadCandidate(
      fileName = part.filename.getOrElse(""),
      declaredContentType = part.contentType.map(contentType =>
        s"${contentType.mediaType.mainType}/${contentType.mediaType.subType}"
      ),
      temporaryPath = temporaryPath
    )

  private def executeUpload(
    request: Request[IO],
    database: Database,
    dataDirectory: Path,
    resolveToken: TokenResolver,
    exhibitionId: ExhibitionId,
    candidates: List[UploadCandidate]
  ): IO[Response[IO]] =
    for
      token <- bearerTokenOf(request)
      response <- database.use { connection =>
                    for
                      userId <- resolveToken.resolve(connection, token)
                      uploadResponse <- UploadPhotosMessage(userId, exhibitionId, dataDirectory, candidates).plan(connection)
                    yield Response[IO](Status.Ok).withEntity(uploadResponse.asJson)
                  }
    yield response

  private def executeContributionUpload(
    request: Request[IO],
    database: Database,
    dataDirectory: Path,
    contributionConfig: ContributionConfig,
    resolveToken: TokenResolver,
    exhibitionId: ExhibitionId,
    contributionId: Option[ContributionId],
    candidates: List[UploadCandidate]
  ): IO[Response[IO]] =
    for
      token <- bearerTokenOf(request)
      response <- database.use { connection =>
                    for
                      userId <- resolveToken.resolve(connection, token)
                      uploadResponse <- ContributionUploadMessage(
                                          userId,
                                          exhibitionId,
                                          contributionId,
                                          dataDirectory,
                                          candidates,
                                          contributionConfig
                                        ).plan(connection)
                    yield Response[IO](Status.Ok).withEntity(uploadResponse.asJson)
                  }
    yield response

  private def handleContent(
    request: Request[IO],
    rawPhotoId: String,
    database: Database,
    dataDirectory: Path,
    resolveToken: TokenResolver
  ): IO[Response[IO]] =
    contentPipeline(request, rawPhotoId, database, dataDirectory, resolveToken).attempt.flatMap(errorBoundary)

  private def contentPipeline(
    request: Request[IO],
    rawPhotoId: String,
    database: Database,
    dataDirectory: Path,
    resolveToken: TokenResolver
  ): IO[Response[IO]] =
    for
      photoId <- parsePhotoId(rawPhotoId)
      variant <- variantOf(request)
      response <- database.use { connection =>
                    for
                      userId <- bearerTokenOption(request).traverse(token => resolveToken.resolve(connection, token))
                      content <- GetPhotoContentMessage(userId, photoId, variant, dataDirectory).plan(connection)
                    yield binaryResponse(content)
                  }
    yield response

  private def handleContributionContent(
    request: Request[IO],
    rawContributionId: String,
    database: Database,
    dataDirectory: Path,
    resolveToken: TokenResolver
  ): IO[Response[IO]] =
    contributionContentPipeline(request, rawContributionId, database, dataDirectory, resolveToken)
      .attempt
      .flatMap(errorBoundary)

  private def contributionContentPipeline(
    request: Request[IO],
    rawContributionId: String,
    database: Database,
    dataDirectory: Path,
    resolveToken: TokenResolver
  ): IO[Response[IO]] =
    for
      contributionId <- parseContributionId(rawContributionId)
      variant <- variantOf(request)
      token <- bearerTokenOf(request)
      response <- database.use { connection =>
                    for
                      userId <- resolveToken.resolve(connection, token)
                      content <- GetContributionContentMessage(Some(userId), contributionId, variant, dataDirectory)
                                   .plan(connection)
                    yield binaryResponse(content)
                  }
    yield response

  private def parseExhibitionId(raw: String): IO[ExhibitionId] =
    Try(UUID.fromString(raw)).toOption match
      case Some(value) => IO.pure(ExhibitionId(value))
      case None => IO.raiseError(ApiException(ApiError.badRequest("exhibitionId 不是合法的 UUID")))

  private def parsePhotoId(raw: String): IO[PhotoId] =
    Try(UUID.fromString(raw)).toOption match
      case Some(value) => IO.pure(PhotoId(value))
      case None => IO.raiseError(ApiException(ApiError.notFound("照片不存在")))

  private def parseContributionId(raw: String): IO[ContributionId] =
    Try(UUID.fromString(raw)).toOption match
      case Some(value) => IO.pure(ContributionId(value))
      case None => IO.raiseError(ApiException(ApiError.notFound("投稿不存在")))

  private def variantOf(request: Request[IO]): IO[PhotoVariant] =
    request.uri.query.params.get(VariantParameter) match
      case None => IO.raiseError(ApiException(ApiError.badRequest("缺少 variant 参数（thumb|full）")))
      case Some(raw) =>
        PhotoVariant.fromString(raw) match
          case Right(variant) => IO.pure(variant)
          case Left(_) => IO.raiseError(ApiException(ApiError.badRequest("variant 参数非法（thumb|full）")))

  private def binaryResponse(content: PhotoContent): Response[IO] =
    val mediaType = MediaType.parse(content.mimeType).getOrElse(MediaType.application.`octet-stream`)
    Response[IO](Status.Ok)
      .withBodyStream(fs2.Stream.chunk(fs2.Chunk.array(content.bytes)))
      .putHeaders(`Content-Type`(mediaType))

  private def bearerTokenOption(request: Request[IO]): Option[String] =
    request.headers.get[Authorization].flatMap { authorization =>
      authorization.credentials match
        case Credentials.Token(AuthScheme.Bearer, token) => Some(token)
        case _ => None
    }

  private def bearerTokenOf(request: Request[IO]): IO[String] =
    bearerTokenOption(request) match
      case Some(token) => IO.pure(token)
      case None => IO.raiseError(ApiException(ApiError.unauthorized("请先登录")))

  private def errorBoundary(result: Either[Throwable, Response[IO]]): IO[Response[IO]] =
    result match
      case Right(response) => IO.pure(response)
      case Left(ApiException(error)) => IO.pure(errorResponse(error))
      case Left(error) =>
        IO(logger.error("照片二进制路由执行失败", error)).as(errorResponse(ApiError.internal("服务器内部错误")))

  private def errorResponse(error: ApiError): Response[IO] =
    val status = Status.fromInt(ErrorCode.httpStatus(error.code)).getOrElse(Status.InternalServerError)
    Response[IO](status).withEntity(ErrorResponse(error))
