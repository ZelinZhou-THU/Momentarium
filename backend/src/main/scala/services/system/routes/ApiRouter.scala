package services.system.routes

import cats.effect.IO
import cats.syntax.all.*
import io.circe.Json
import org.http4s.circe.CirceEntityCodec.*
import org.http4s.dsl.io.*
import org.http4s.headers.Authorization
import org.http4s.{AuthScheme, Credentials, HttpRoutes, Request, Response, Status}
import org.slf4j.LoggerFactory

import services.system.api.{ApiError, ApiException, ErrorCode, ErrorResponse}
import services.system.db.Database

/** 消息路由入口：POST /api/{routeName}，负责分发、反序列化、令牌转换、执行 plan 与错误边界。 */
object ApiRouter:
  private val logger = LoggerFactory.getLogger(getClass)

  def routes(apiMessages: List[ApiRoute], resolveToken: TokenResolver, database: Database): HttpRoutes[IO] =
    val routesByName = apiMessages.map(route => route.routeName -> route).toMap
    HttpRoutes.of[IO] { case request @ POST -> Root / "api" / routeName =>
      routesByName.get(routeName) match
        case Some(route) => handleRoute(route, request, resolveToken, database)
        case None => IO.pure(errorResponse(ApiError.notFound(s"未注册的 API 路由: $routeName")))
    }

  private def handleRoute(
    route: ApiRoute,
    request: Request[IO],
    resolveToken: TokenResolver,
    database: Database
  ): IO[Response[IO]] =
    val execution = for
      body <- readRequestBody(route, request)
      responseJson <- database.use { connection =>
        route.handle(
          connection = connection,
          token = bearerToken(request),
          body = body,
          resolveUserId = rawToken => resolveToken.resolve(connection, rawToken)
        )
      }
    yield Response[IO](Status.Ok).withEntity(responseJson)

    execution.attempt.flatMap {
      case Right(response) => IO.pure(response)
      case Left(ApiException(error)) => IO.pure(errorResponse(error))
      case Left(error) =>
        IO(logger.error("未处理的 API 错误", error))
          .as(errorResponse(ApiError.internal("服务器内部错误")))
    }

  private[routes] def readRequestBody(route: ApiRoute, request: Request[IO]): IO[Json] =
    if route.requiresRequestBody then
      route.maxRequestBodyBytes match
        case Some(maxBytes) => JsonRequestBody.read(request, maxBytes)
        case None =>
          request.as[Json].adaptError { case _ => ApiException(ApiError.badRequest("请求体不是合法 JSON")) }
    else IO.pure(Json.obj())

  private def bearerToken(request: Request[IO]): Option[String] =
    request.headers.get[Authorization].flatMap { authorization =>
      authorization.credentials match
        case Credentials.Token(AuthScheme.Bearer, token) => Some(token)
        case _ => None
    }

  private def errorResponse(error: ApiError): Response[IO] =
    val status = Status.fromInt(ErrorCode.httpStatus(error.code)).getOrElse(Status.InternalServerError)
    Response[IO](status).withEntity(ErrorResponse(error))
