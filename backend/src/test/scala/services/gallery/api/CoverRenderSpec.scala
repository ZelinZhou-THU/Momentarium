package services.gallery.api

import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path}
import java.time.Instant
import java.util.UUID
import javax.imageio.ImageIO

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*
import org.http4s.implicits.*
import org.http4s.{Method, Request, Status, Uri}

import services.gallery.objects.{CoverKind, Exhibition, ExhibitionId, PhotoFormat, UploadCandidate}
import services.gallery.routes.CoverRenderRoutes
import services.gallery.tables.{
  ExhibitionGroupTableInitializer,
  ExhibitionPhotoTableInitializer,
  ExhibitionTable,
  ExhibitionTableInitializer,
  PublicationTableInitializer
}
import services.gallery.utils.{CoverRenderFiles, ExifJpegs, PhotoStorage}
import services.system.api.{ApiException, ErrorCode, ValidationReason}
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Transaction}
import services.system.routes.TokenResolver
import services.system.startup.AppRuntime
import services.users.objects.UserId

class CoverRenderSpec extends munit.FunSuite:
  test("cover-render 上传、setcover(render)、封面字节读取与各类校验") {
    (for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message)))
      dataDirectory = Files.createTempDirectory("momentarium-cover-render-")
      _ <- Database
             .resource(config.database)
             .use { database =>
               for
                 _ <- initializeGalleryTables(database)
                 _ <- AppRuntime.initialize(config.copy(dataDir = dataDirectory), database)
                 _ <- runScenario(database, dataDirectory)
               yield ()
             }
             .guarantee(deleteDirectory(dataDirectory))
    yield ()).unsafeRunSync()
  }

  private def runScenario(database: Database, dataDirectory: Path): IO[Unit] =
    val ownerId = UserId(UUID.randomUUID())
    val strangerId = UserId(UUID.randomUUID())
    val exhibitionId = ExhibitionId(UUID.randomUUID())
    val otherExhibitionId = ExhibitionId(UUID.randomUUID())
    val now = Instant.parse("2026-10-27T10:00:00Z")
    val exhibition = Exhibition(
      id = exhibitionId,
      ownerId = ownerId,
      title = "渲染封面测试",
      narrative = "",
      curationVersion = 0,
      coverKind = CoverKind.Auto,
      coverPhotoId = None,
      coverStorageKey = None,
      coverMime = None,
      coverWidth = None,
      coverHeight = None,
      createdAt = now,
      updatedAt = now
    )
    val scenario = for
      _ <- database.use(connection => ExhibitionTable.insert(connection, exhibition))
      _ <- database.use(connection => ExhibitionTable.insert(connection, exhibition.copy(id = otherExhibitionId)))
      jpeg <- imageBytes(800, 600, "jpg")
      candidate <- candidateFile("render.jpg", jpeg)
      uploaded <- database.use(connection =>
                    UploadCoverRenderMessage(ownerId, exhibitionId, dataDirectory, candidate).plan(connection)
                  )
      _ <- IO(assertEquals(uploaded.width, 800))
      _ <- IO(assertEquals(uploaded.height, 600))
      _ <- IO(assert(CoverRenderFiles.parseRenderKey(uploaded.renderKey).isDefined, "renderKey 应为 UUID"))
      located <- CoverRenderFiles.locate(dataDirectory, exhibitionId, uploaded.renderKey)
      _ <- IO(assertEquals(located.map(_._2), Some(PhotoFormat.Jpeg)))

      cover <- database.use(connection =>
                 SetCoverMessage(ownerId, exhibitionId, CoverKind.Render, None, Some(uploaded.renderKey)).plan(connection)
               )
      _ <- IO(assertEquals(cover.kind, CoverKind.Render))
      _ <- IO(assertEquals(cover.width, 800))
      _ <- IO(assertEquals(cover.height, 600))
      storedCover <- database.use(connection => ExhibitionTable.findById(connection, exhibitionId))
      _ <- IO(assertEquals(storedCover.map(_.curationVersion), Some(0)))
      _ <- IO(assertEquals(storedCover.map(_.coverKind), Some(CoverKind.Render)))
      _ <- IO(assertEquals(storedCover.flatMap(_.coverStorageKey), located.map(_._1)))
      _ <- IO(assertEquals(storedCover.flatMap(_.coverMime), Some("image/jpeg")))

      content <- database.use(connection =>
                   GetExhibitionCoverMessage(Some(ownerId), exhibitionId, dataDirectory).plan(connection)
                 )
      _ <- IO(assertEquals(content.mimeType, "image/jpeg"))
      // 上传即重编码：存储与读取的字节是去元数据的重编码结果，不再与原始上传字节相同。
      _ <- IO(assertNotEquals(content.bytes.toList, jpeg.toList))
      _ <- IO(assert(!ExifJpegs.hasExif(content.bytes), "渲染封面不得携带 EXIF"))
      _ <- IO(assertEquals(ExifJpegs.dimensions(content.bytes), (800, 600)))
      stored <- PhotoStorage.read(dataDirectory, located.get._1)
      _ <- IO(assert(!ExifJpegs.hasExif(stored), "渲染封面存储文件不得携带 EXIF"))

      _ <- assertValidation(
             database.use(connection =>
               SetCoverMessage(ownerId, exhibitionId, CoverKind.Render, None, Some(UUID.randomUUID().toString)).plan(connection)
             ),
             ValidationReason.InvalidCover,
             "伪造 renderKey"
           )
      _ <- assertValidation(
             database.use(connection =>
               SetCoverMessage(ownerId, exhibitionId, CoverKind.Render, None, Some(s"render/${uploaded.renderKey}/cover.jpg")).plan(connection)
             ),
             ValidationReason.InvalidCover,
             "非法 renderKey 格式"
           )
      _ <- assertValidation(
             database.use(connection =>
               SetCoverMessage(ownerId, otherExhibitionId, CoverKind.Render, None, Some(uploaded.renderKey)).plan(connection)
             ),
             ValidationReason.InvalidCover,
             "跨展览 renderKey"
           )
      _ <- assertCode(
             database.use(connection =>
               SetCoverMessage(strangerId, exhibitionId, CoverKind.Render, None, Some(uploaded.renderKey)).plan(connection)
             ),
             ErrorCode.NotFound,
             "他人设置封面"
           )

      oversizedBytes <- IO(new Array[Byte]((CoverRenderFiles.MaxCoverBytes + 1).toInt))
      oversizedCandidate <- candidateFile("oversized.jpg", oversizedBytes)
      _ <- assertValidation(
             database.use(connection =>
               UploadCoverRenderMessage(ownerId, exhibitionId, dataDirectory, oversizedCandidate).plan(connection)
             ),
             ValidationReason.CoverTooLarge,
             "超过 4MB"
           )
      textCandidate <- candidateFile("note.txt", "not an image".getBytes(StandardCharsets.UTF_8))
      _ <- assertValidation(
             database.use(connection =>
               UploadCoverRenderMessage(ownerId, exhibitionId, dataDirectory, textCandidate).plan(connection)
             ),
             ValidationReason.CoverUnsupportedType,
             "非图片字节"
           )
      wide <- imageBytes(CoverRenderFiles.MaxCoverLongEdge + 1, 8, "jpg")
      wideCandidate <- candidateFile("wide.jpg", wide)
      _ <- assertValidation(
             database.use(connection =>
               UploadCoverRenderMessage(ownerId, exhibitionId, dataDirectory, wideCandidate).plan(connection)
             ),
             ValidationReason.CoverTooLarge,
             "长边超过 2048"
           )

      routes = CoverRenderRoutes.routes(database, dataDirectory, TokenResolver((_, _) => IO.raiseError(new IllegalStateException("不应解析令牌"))))
      unauthorized <- routes.orNotFound.run(
                        Request[IO](
                          Method.POST,
                          Uri.unsafeFromString(s"/api/exhibitions/${exhibitionId.value}/cover-render")
                        )
                      )
      _ <- IO(assertEquals(unauthorized.status, Status.Unauthorized))
    yield ()
    scenario.guarantee(
      database.use(connection => List(exhibitionId, otherExhibitionId).traverse_(id => ExhibitionTable.delete(connection, id, ownerId))).attempt.void
    )

  private def initializeGalleryTables(database: Database): IO[Unit] =
    val initializers = List(
      ExhibitionTableInitializer.initialize,
      ExhibitionGroupTableInitializer.initialize,
      ExhibitionPhotoTableInitializer.initialize,
      PublicationTableInitializer.initialize
    )
    database.use(connection => Transaction(connection)(initializers.traverse_(initialize => initialize(connection))))

  private def candidateFile(fileName: String, bytes: Array[Byte]): IO[UploadCandidate] =
    IO.blocking {
      val path = Files.createTempFile("momentarium-cover-candidate-", ".upload")
      Files.write(path, bytes)
      UploadCandidate(fileName, Some("image/jpeg"), path)
    }

  private def imageBytes(width: Int, height: Int, format: String): IO[Array[Byte]] =
    IO.blocking {
      val image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
      val output = new ByteArrayOutputStream()
      ImageIO.write(image, format, output)
      output.toByteArray
    }

  private def assertValidation(action: IO[?], reason: ValidationReason, context: String): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) =>
        assertEquals(error.code, ErrorCode.Validation, context)
        assertEquals(
          error.details.flatMap(_.apply("reason")).flatMap(_.asString),
          Some(ValidationReason.toString(reason)),
          context
        )
      case other => fail(s"$context 期望 VALIDATION(${ValidationReason.toString(reason)})，实际: $other")
    }

  private def assertCode(action: IO[?], expectedCode: ErrorCode, context: String): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) => assertEquals(error.code, expectedCode, context)
      case other => fail(s"$context 期望 $expectedCode，实际: $other")
    }

  private def deleteDirectory(directory: Path): IO[Unit] =
    IO.blocking {
      import scala.jdk.CollectionConverters.*
      Files.walk(directory).iterator().asScala.toList.reverse.foreach(Files.deleteIfExists)
    }
