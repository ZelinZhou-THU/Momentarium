package services.system.routes

import java.sql.Connection
import java.util.UUID

import cats.effect.IO
import io.circe.{Decoder, Encoder, Json}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import io.circe.parser.parse

import services.system.api.{APIMessage, APIWithTokenMessage, NoRequestMessage}
import services.users.objects.UserId

final case class TestRequest(value: Int)

object TestRequest:
  given Decoder[TestRequest] = deriveDecoder[TestRequest]
  given Encoder[TestRequest] = deriveEncoder[TestRequest]

final case class TestPublicMessage(request: TestRequest) extends APIMessage[TestRequest]:
  override def plan(connection: Connection): IO[TestRequest] = IO.pure(request)

final case class TestTokenMessage(userId: UserId, request: TestRequest) extends APIWithTokenMessage[TestRequest]:
  override def plan(connection: Connection): IO[TestRequest] = IO.pure(request)

final case class TestNoRequestMessage() extends NoRequestMessage[TestRequest]:
  override def plan(connection: Connection): IO[TestRequest] = IO.pure(TestRequest(7))

final case class TestTokenNoRequestMessage(userId: UserId)
    extends APIWithTokenMessage[UserId],
      NoRequestMessage[UserId]:
  override def plan(connection: Connection): IO[UserId] = IO.pure(userId)

class ApiRouteSpec extends munit.FunSuite:
  private val fixedUserId = UserId(UUID.fromString("0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10"))
  private val connection: Connection = null
  private def unusedResolver(rawToken: String): IO[UserId] =
    IO.raiseError(new IllegalStateException(s"不应解析令牌: $rawToken"))

  test("路由名从本地消息类名推导") {
    val route = ApiRoute.public[TestRequest, TestRequest, TestPublicMessage](request => TestPublicMessage(request))
    assertEquals(route.routeName, "testpublic")
    assertEquals(route.requiresRequestBody, true)
  }

  test("公开 + 请求体：反序列化后构造消息并编码响应") {
    val route = ApiRoute.public[TestRequest, TestRequest, TestPublicMessage](request => TestPublicMessage(request))
    val body = parse("""{"value":42}""").toOption.get
    val response = route.handle(connection, None, body, unusedResolver).unsafeRunSync()
    assertEquals(response, parse("""{"value":42}""").toOption.get)
  }

  test("公开 + 请求体：字段格式错误返回 BAD_REQUEST") {
    val route = ApiRoute.public[TestRequest, TestRequest, TestPublicMessage](request => TestPublicMessage(request))
    val body = parse("""{"value":"not-an-int"}""").toOption.get
    val error = intercept[services.system.api.ApiException](route.handle(connection, None, body, unusedResolver).unsafeRunSync())
    assertEquals(error.error.code, services.system.api.ErrorCode.BadRequest)
  }

  test("令牌 + 请求体：缺少令牌返回 UNAUTHORIZED") {
    val route = ApiRoute.withToken[TestRequest, TestRequest, TestTokenMessage]((userId, request) =>
      TestTokenMessage(userId, request)
    )
    val error = intercept[services.system.api.ApiException](
      route.handle(connection, None, Json.obj(), unusedResolver).unsafeRunSync()
    )
    assertEquals(error.error.code, services.system.api.ErrorCode.Unauthorized)
  }

  test("令牌 + 请求体：先解析令牌再构造消息") {
    val route = ApiRoute.withToken[TestRequest, TestRequest, TestTokenMessage]((userId, request) =>
      TestTokenMessage(userId, request)
    )
    val body = parse("""{"value":1}""").toOption.get
    val response = route.handle(connection, Some("raw-token"), body, _ => IO.pure(fixedUserId)).unsafeRunSync()
    assertEquals(response, parse("""{"value":1}""").toOption.get)
  }

  test("公开 + 无请求体：不解析请求内容") {
    val route = ApiRoute.noRequest[TestRequest, TestNoRequestMessage](() => TestNoRequestMessage())
    val response = route.handle(connection, None, Json.Null, unusedResolver).unsafeRunSync()
    assertEquals(response, parse("""{"value":7}""").toOption.get)
    assertEquals(route.requiresRequestBody, false)
  }

  test("令牌 + 无请求体：缺少令牌返回 UNAUTHORIZED，成功后返回可信 userId") {
    val route = ApiRoute.noRequestWithToken[UserId, TestTokenNoRequestMessage](userId => TestTokenNoRequestMessage(userId))
    val error = intercept[services.system.api.ApiException](
      route.handle(connection, None, Json.obj(), unusedResolver).unsafeRunSync()
    )
    assertEquals(error.error.code, services.system.api.ErrorCode.Unauthorized)
    val response = route.handle(connection, Some("raw-token"), Json.Null, _ => IO.pure(fixedUserId)).unsafeRunSync()
    assertEquals(response, Json.fromString(fixedUserId.value.toString))
  }

  private given cats.effect.unsafe.IORuntime = cats.effect.unsafe.IORuntime.global
