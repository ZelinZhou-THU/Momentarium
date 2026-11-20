package services.system.routes

import java.nio.charset.StandardCharsets
import java.util.Base64

import cats.effect.IO
import fs2.Stream
import io.circe.Json
import munit.CatsEffectSuite
import org.http4s.{Header, Headers, Request}
import org.typelevel.ci.CIString

import services.system.api.{ApiException, ErrorCode}
import services.scene.routes.SceneRoutes

class JsonRequestBodySpec extends CatsEffectSuite:
  private val limit = JsonRequestBody.ReviewMaxBytes
  private def request(body: String, declared: Boolean): Request[IO] =
    val bytes = body.getBytes(StandardCharsets.UTF_8)
    Request[IO](headers = if declared then Headers(Header.Raw(CIString("Content-Length"), bytes.length.toString)) else Headers.empty)
      .withBodyStream(Stream.emits(bytes).covary[IO])

  private def paddedJson(bytes: Int): String = "\"" + ("a" * (bytes - 2)) + "\""

  List(true, false).foreach { declared =>
    test(s"恰好 12 MiB JSON 可读取，Content-Length=$declared") {
      JsonRequestBody.read(request(paddedJson(limit.toInt), declared), limit).map(json =>
        assertEquals(json.asString.map(_.length), Some(limit.toInt - 2))
      )
    }
    test(s"超过 12 MiB 返回 BAD_REQUEST，Content-Length=$declared") {
      JsonRequestBody.read(request(paddedJson(limit.toInt + 1), declared), limit).attempt.map {
        case Left(ApiException(error)) => assertEquals(error.code, ErrorCode.BadRequest)
        case other => fail(s"应拒绝超限请求，实际 ${other.map(_ => "accepted")}")
      }
    }
  }

  test("四张各 2 MiB 图片的完整评审 JSON 可以读取") {
    val capture = "data:image/jpeg;base64," + Base64.getEncoder.encodeToString(Array.fill[Byte](2 * 1024 * 1024)(0))
    val json = Json.obj(
      "runId" -> Json.fromString("11111111-1111-4111-8111-111111111111"),
      "captures" -> Json.arr(List.fill(4)(Json.fromString(capture))*),
      "runtime" -> Json.obj("buildMs" -> Json.fromInt(100), "fps" -> Json.fromInt(40),
        "errors" -> Json.arr(), "photoIdsUsed" -> Json.arr(), "networkAttempts" -> Json.fromInt(0))
    )
    JsonRequestBody.read(request(json.noSpaces, false), limit).map(actual => assertEquals(actual, json))
  }

  test("超限后不读取后续无限或昂贵流，即使 Content-Length 不可信") {
    val source = Stream.emits(paddedJson(1025).getBytes(StandardCharsets.UTF_8)).covary[IO] ++
      Stream.eval(IO.raiseError[Byte](new IllegalStateException("不应读取后续数据")))
    val input = Request[IO](headers = Headers(Header.Raw(CIString("Content-Length"), "1"))).withBodyStream(source)
    JsonRequestBody.read(input, 1024).attempt.map {
      case Left(ApiException(error)) =>
        assertEquals(error.code, ErrorCode.BadRequest)
        assert(error.message.contains("上限"))
      case other => fail(s"未及时停止超限读取：$other")
    }
  }

  test("非法 JSON 返回 BAD_REQUEST") {
    JsonRequestBody.read(request("{", false), limit).attempt.map {
      case Left(ApiException(error)) => assertEquals(error.code, ErrorCode.BadRequest)
      case other => fail(s"应拒绝非法 JSON：$other")
    }
  }

  test("实际 reviewscene 注册路由应用容量门禁，错误映射 HTTP 400") {
    val route = SceneRoutes.apiMessages.find(_.routeName == "reviewscene").getOrElse(fail("缺少 reviewscene 注册"))
    ApiRouter.readRequestBody(route, request(paddedJson(limit.toInt + 1), false)).attempt.map {
      case Left(ApiException(error)) =>
        assertEquals(error.code, ErrorCode.BadRequest)
        assertEquals(ErrorCode.httpStatus(error.code), 400)
        assert(error.message.contains("上限"))
      case other => fail(s"注册路由未应用限制：${other.map(_ => "accepted")}")
    }
  }
