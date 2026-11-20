package services.system.assets

import java.nio.file.Files

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import org.http4s.implicits.*
import org.http4s.{Method, Request, Status, Uri}

class StaticRoutesSpec extends munit.FunSuite:
  test("dist 不存在时 GET / 返回明确的 404 而不是崩溃") {
    val emptyDist = Files.createTempDirectory("momentarium-empty-dist")
    val emptyVendor = Files.createTempDirectory("momentarium-empty-vendor")
    val response = StaticRoutes
      .routes(emptyDist, emptyVendor)
      .orNotFound
      .run(Request[IO](Method.GET, Uri.unsafeFromString("/")))
      .unsafeRunSync()
    assertEquals(response.status, Status.NotFound)
  }

  test("dist 存在时 SPA 深层路由 fallback 到 index.html") {
    val dist = Files.createTempDirectory("momentarium-dist")
    Files.writeString(dist.resolve("index.html"), "<html>momentarium</html>")
    val vendor = Files.createTempDirectory("momentarium-vendor")
    val response = StaticRoutes
      .routes(dist, vendor)
      .orNotFound
      .run(Request[IO](Method.GET, Uri.unsafeFromString("/exhibitions/some-id")))
      .unsafeRunSync()
    assertEquals(response.status, Status.Ok)
  }

  test("dist 存在时真实静态文件按路径返回") {
    val dist = Files.createTempDirectory("momentarium-dist")
    Files.writeString(dist.resolve("index.html"), "<html>momentarium</html>")
    Files.createDirectories(dist.resolve("assets"))
    Files.writeString(dist.resolve("assets/app.js"), "console.log('ok')")
    val vendor = Files.createTempDirectory("momentarium-vendor")
    val response = StaticRoutes
      .routes(dist, vendor)
      .orNotFound
      .run(Request[IO](Method.GET, Uri.unsafeFromString("/assets/app.js")))
      .unsafeRunSync()
    assertEquals(response.status, Status.Ok)
  }

  test("缺少 /vendor/three.min.js 时返回 404") {
    val dist = Files.createTempDirectory("momentarium-dist")
    val vendor = Files.createTempDirectory("momentarium-vendor")
    val response = StaticRoutes
      .routes(dist, vendor)
      .orNotFound
      .run(Request[IO](Method.GET, Uri.unsafeFromString("/vendor/three.min.js")))
      .unsafeRunSync()
    assertEquals(response.status, Status.NotFound)
  }

  test("静态文件按扩展名返回正确 Content-Type，且 body 是原始 HTML 字节而不是 JSON 字节数组") {
    val dist = Files.createTempDirectory("momentarium-dist")
    Files.writeString(dist.resolve("index.html"), "<!doctype html><html>momentarium</html>")
    val vendor = Files.createTempDirectory("momentarium-vendor")
    val response = StaticRoutes
      .routes(dist, vendor)
      .orNotFound
      .run(Request[IO](Method.GET, Uri.unsafeFromString("/")))
      .unsafeRunSync()
    assertEquals(response.status, Status.Ok)
    assertEquals(response.headers.get[org.http4s.headers.`Content-Type`].map(_.mediaType), Some(org.http4s.MediaType.text.html))
    val bodyText = new String(response.body.compile.to(Array).unsafeRunSync(), java.nio.charset.StandardCharsets.UTF_8)
    assert(bodyText.startsWith("<!doctype html>"), s"body 应为原始 HTML 字节，实际开头: ${bodyText.take(30)}")
  }

  test("JS 静态资源返回 application/javascript") {
    val dist = Files.createTempDirectory("momentarium-dist")
    Files.writeString(dist.resolve("index.html"), "<!doctype html><html></html>")
    Files.createDirectories(dist.resolve("assets"))
    Files.writeString(dist.resolve("assets/app.js"), "console.log('ok')")
    val vendor = Files.createTempDirectory("momentarium-vendor")
    val response = StaticRoutes
      .routes(dist, vendor)
      .orNotFound
      .run(Request[IO](Method.GET, Uri.unsafeFromString("/assets/app.js")))
      .unsafeRunSync()
    assertEquals(response.status, Status.Ok)
    assertEquals(
      response.headers.get[org.http4s.headers.`Content-Type`].map(_.mediaType),
      Some(org.http4s.MediaType.application.javascript)
    )
  }

  test("HEAD 请求返回相同状态但无响应体") {
    val dist = Files.createTempDirectory("momentarium-dist")
    Files.writeString(dist.resolve("index.html"), "<html>momentarium</html>")
    val vendor = Files.createTempDirectory("momentarium-vendor")
    val response = StaticRoutes
      .routes(dist, vendor)
      .orNotFound
      .run(Request[IO](Method.HEAD, Uri.unsafeFromString("/")))
      .unsafeRunSync()
    assertEquals(response.status, Status.Ok)
    val bodyLength = response.body.compile.toList.unsafeRunSync().length
    assertEquals(bodyLength, 0)
  }

  test("匿名 GET /api/... 返回 404 且不被 SPA fallback 吞掉") {
    val dist = Files.createTempDirectory("momentarium-dist")
    Files.writeString(dist.resolve("index.html"), "<html>momentarium</html>")
    val vendor = Files.createTempDirectory("momentarium-vendor")
    val response = StaticRoutes
      .routes(dist, vendor)
      .orNotFound
      .run(Request[IO](Method.GET, Uri.unsafeFromString("/api/unknown")))
      .unsafeRunSync()
    assertEquals(response.status, Status.NotFound)
  }
