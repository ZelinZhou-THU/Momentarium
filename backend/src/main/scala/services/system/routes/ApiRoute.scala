package services.system.routes

import java.sql.Connection

import cats.effect.IO
import io.circe.{Decoder, Encoder, Json}
import io.circe.syntax.*
import scala.reflect.ClassTag

import services.system.api.{APIMessage, APIWithTokenMessage, ApiError, ApiException, NoRequestMessage}
import services.users.objects.UserId

/**
 * 一条已注册的前端 API：路由名默认由消息类名推导，handle 只做反序列化、构造消息、执行 plan 与序列化。
 * maxRequestBodyBytes 是可选的传输层容量门禁（UTF-8 字节）：只用于请求体很大的路由，
 * 超限由路由器在 JSON 解码前有界读取并返回 400 BAD_REQUEST。
 */
trait ApiRoute:
  def routeName: String
  def requiresRequestBody: Boolean
  def maxRequestBodyBytes: Option[Long] = None
  def handle(
    connection: Connection,
    token: Option[String],
    body: Json,
    resolveUserId: String => IO[UserId]
  ): IO[Json]

object ApiRoute:
  /** 路由名默认由消息类名推导；契约中无法由类名推导的历史路由（如 §2.2 的 `publish`）允许显式传入。 */
  def public[Req, Res, Message <: APIMessage[Res]: ClassTag](
    build: Req => Message,
    routeName: Option[String] = None,
    maxRequestBodyBytes: Option[Long] = None
  )(using Decoder[Req], Encoder[Res]): ApiRoute =
    messageRoute(summon[ClassTag[Message]].runtimeClass.getSimpleName, bodyRequired = true, routeName, maxRequestBodyBytes) {
      (connection, _, body, _) =>
        for
          request <- decodeRequest[Req](body)
          response <- build(request).plan(connection)
        yield response.asJson
    }

  def withToken[Req, Res, Message <: APIWithTokenMessage[Res]: ClassTag](
    build: (UserId, Req) => Message,
    routeName: Option[String] = None,
    maxRequestBodyBytes: Option[Long] = None
  )(using Decoder[Req], Encoder[Res]): ApiRoute =
    messageRoute(summon[ClassTag[Message]].runtimeClass.getSimpleName, bodyRequired = true, routeName, maxRequestBodyBytes) {
      (connection, token, body, resolveUserId) =>
        for
          rawToken <- requireToken(token)
          userId <- resolveUserId(rawToken)
          request <- decodeRequest[Req](body)
          response <- build(userId, request).plan(connection)
        yield response.asJson
    }

  def noRequest[Res, Message <: NoRequestMessage[Res]: ClassTag](
    build: () => Message,
    routeName: Option[String] = None
  )(using Encoder[Res]): ApiRoute =
    messageRoute(summon[ClassTag[Message]].runtimeClass.getSimpleName, bodyRequired = false, routeName, None) {
      (connection, _, _, _) => build().plan(connection).map(_.asJson)
    }

  def noRequestWithToken[Res, Message <: APIWithTokenMessage[Res] & NoRequestMessage[Res]: ClassTag](
    build: UserId => Message,
    routeName: Option[String] = None
  )(using Encoder[Res]): ApiRoute =
    messageRoute(summon[ClassTag[Message]].runtimeClass.getSimpleName, bodyRequired = false, routeName, None) {
      (connection, token, _, resolveUserId) =>
        for
          rawToken <- requireToken(token)
          userId <- resolveUserId(rawToken)
          response <- build(userId).plan(connection)
        yield response.asJson
    }

  private def messageRoute(
    messageClassName: String,
    bodyRequired: Boolean,
    routeNameOverride: Option[String],
    bodyLimit: Option[Long]
  )(execute: (Connection, Option[String], Json, String => IO[UserId]) => IO[Json]): ApiRoute =
    new ApiRoute:
      val routeName: String = routeNameOverride.getOrElse(RouteName.fromMessageClassName(messageClassName))
      val requiresRequestBody: Boolean = bodyRequired
      override val maxRequestBodyBytes: Option[Long] = bodyLimit
      def handle(
        connection: Connection,
        token: Option[String],
        body: Json,
        resolveUserId: String => IO[UserId]
      ): IO[Json] =
        execute(connection, token, body, resolveUserId)

  private def decodeRequest[A](body: Json)(using decoder: Decoder[A]): IO[A] =
    decoder.decodeJson(body) match
      case Right(request) => IO.pure(request)
      case Left(_) => IO.raiseError(ApiException(ApiError.badRequest("请求体字段格式不正确")))

  private def requireToken(token: Option[String]): IO[String] =
    token match
      case Some(rawToken) => IO.pure(rawToken)
      case None => IO.raiseError(ApiException(ApiError.unauthorized("请先登录")))
