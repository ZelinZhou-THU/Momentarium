package services.system.assets

import java.nio.file.{Files, Path}

import cats.effect.IO
import fs2.Stream
import org.http4s.dsl.io.*
import org.http4s.headers.`Content-Type`
import org.http4s.{HttpRoutes, MediaType, Response, Status, Uri}
import org.slf4j.LoggerFactory

/** 前端静态资源、/vendor/three.min.js 与 SPA fallback（生产态单端口演示）。 */
object StaticRoutes:
  private val logger = LoggerFactory.getLogger(getClass)
  private val threeFileName = "three.min.js"
  private val svgMediaType = MediaType.unsafeParse("image/svg+xml")

  def routes(distDirectory: Path, vendorDirectory: Path): HttpRoutes[IO] =
    HttpRoutes.of[IO] {
      case GET -> Root / "vendor" / fileName if fileName == threeFileName =>
        serveVendorFile(vendorDirectory.resolve(threeFileName))
      case HEAD -> Root / "vendor" / fileName if fileName == threeFileName =>
        serveVendorFile(vendorDirectory.resolve(threeFileName)).map(withoutBody)
      case GET -> path if isApiPath(path) =>
        IO.pure(apiNotFoundResponse)
      case HEAD -> path if isApiPath(path) =>
        IO.pure(withoutBody(apiNotFoundResponse))
      case GET -> path =>
        servePathOrFallback(distDirectory, path)
      case HEAD -> path =>
        servePathOrFallback(distDirectory, path).map(withoutBody)
    }

  private def isApiPath(path: Uri.Path): Boolean =
    path.renderString.stripPrefix("/").split('/').headOption.contains("api")

  private def servePathOrFallback(distDirectory: Path, path: Uri.Path): IO[Response[IO]] =
    val relativePath = path.renderString.stripPrefix("/")
    val file = distDirectory.toAbsolutePath.normalize.resolve(relativePath).normalize
    IO.blocking(Files.isRegularFile(file) && file.startsWith(distDirectory.toAbsolutePath.normalize)).flatMap {
      case true => serveFile(file)
      case false => serveIndex(distDirectory)
    }

  private def serveIndex(distDirectory: Path): IO[Response[IO]] =
    val index = distDirectory.resolve("index.html")
    IO.blocking(Files.isRegularFile(index)).flatMap {
      case true => serveFile(index)
      case false => IO.pure(notBuiltResponse)
    }

  private def serveVendorFile(file: Path): IO[Response[IO]] =
    IO.blocking(Files.isRegularFile(file)).flatMap {
      case true => serveFile(file)
      case false =>
        IO(logger.warn("缺少场景运行时资源 {}，请确认 frontend/public/vendor 已提供该文件", file.toString))
          .as(Response[IO](Status.NotFound))
    }

  private def serveFile(file: Path): IO[Response[IO]] =
    IO.blocking(Files.readAllBytes(file)).map { bytes =>
      Response[IO](Status.Ok)
        .withEntity(bytes)
        .putHeaders(`Content-Type`(contentType(file)))
    }

  private def withoutBody(response: Response[IO]): Response[IO] =
    response.withBodyStream(Stream.empty)

  private def apiNotFoundResponse: Response[IO] =
    Response[IO](Status.NotFound).withEntity("未注册的 API 路径")

  private def notBuiltResponse: Response[IO] =
    Response[IO](Status.NotFound)
      .withEntity("前端构建产物 frontend/dist 不存在，请先在 frontend/ 执行 pnpm build")

  private def contentType(file: Path): MediaType =
    val name = file.getFileName.toString.toLowerCase
    if name.endsWith(".html") then MediaType.text.html
    else if name.endsWith(".js") || name.endsWith(".mjs") then MediaType.application.javascript
    else if name.endsWith(".css") then MediaType.text.css
    else if name.endsWith(".json") then MediaType.application.json
    else if name.endsWith(".svg") then svgMediaType
    else if name.endsWith(".png") then MediaType.image.png
    else if name.endsWith(".jpg") || name.endsWith(".jpeg") then MediaType.image.jpeg
    else if name.endsWith(".webp") then MediaType.image.webp
    else if name.endsWith(".woff2") then MediaType.font.woff2
    else if name.endsWith(".woff") then MediaType.font.woff
    else if name.endsWith(".ttf") then MediaType.font.ttf
    else MediaType.application.`octet-stream`
