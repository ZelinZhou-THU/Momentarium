package services.gallery.api

import java.nio.file.{Files, Path}
import java.time.Instant
import java.util.UUID
import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*
import services.gallery.objects.{CoverKind, Exhibition, ExhibitionId, UploadCandidate, UploadFailureReason}
import services.gallery.tables.{ExhibitionTable, ExhibitionTableInitializer, ExhibitionGroupTableInitializer, ExhibitionPhotoTableInitializer, PublicationTableInitializer}
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Transaction}
import services.system.startup.AppRuntime
import services.users.objects.UserId

class WebpUploadSpec extends munit.FunSuite:
  test("静态 WebP 上传成功，动画和损坏文件按既有契约拒绝") {
    (for
      env <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(AppConfig.load(env ++ sys.env).left.map(new IllegalStateException(_)))
      directory <- IO.blocking(Files.createTempDirectory("webp-upload-"))
      _ <- Database.resource(config.database).use { database =>
             val owner = UserId(UUID.randomUUID())
             val id = ExhibitionId(UUID.randomUUID())
             val now = Instant.parse("2026-10-27T10:00:00Z")
             val exhibition = Exhibition(id, owner, "WebP", "", 0, CoverKind.Auto, None, None, None, None, None, now, now)
             val candidates = List("lossy.webp", "lossless.webp", "transparent.webp", "animated.webp", "damaged.webp")
               .map(name => UploadCandidate(name, Some("image/webp"), Path.of("..", "tests", "fixtures", "images", name)))
             val initializers = List(ExhibitionTableInitializer.initialize, ExhibitionGroupTableInitializer.initialize, ExhibitionPhotoTableInitializer.initialize, PublicationTableInitializer.initialize)
             val scenario = for
               _ <- database.use(connection => Transaction(connection)(initializers.traverse_(initialize => initialize(connection))))
               _ <- AppRuntime.initialize(config.copy(dataDir = directory), database)
               _ <- database.use(connection => ExhibitionTable.insert(connection, exhibition))
               result <- database.use(connection => UploadPhotosMessage(owner, id, directory, candidates).plan(connection))
               _ <- IO(assertEquals(result.photos.map(_.originalName), List("lossy.webp", "lossless.webp", "transparent.webp")))
               _ <- IO(assertEquals(result.photos.map(photo => (photo.width, photo.height)), List((640, 320), (640, 320), (160, 120))))
               _ <- IO(assertEquals(result.failures.map(_.reason), List(UploadFailureReason.UnsupportedType, UploadFailureReason.UnsupportedType)))
             yield ()
             // 测试结束（含断言失败）都删除本测试随机创建的展览，级联删除照片行；临时文件由外层 guarantee 清理。
             scenario.guarantee(
               database.use(connection => ExhibitionTable.delete(connection, id, owner)).attempt.void
             )
           }.guarantee(IO.blocking {
             import scala.jdk.CollectionConverters.*
             val paths = Files.walk(directory)
             val entries = paths.iterator().asScala.toList.reverse
             paths.close()
             entries.foreach(Files.deleteIfExists)
           })
    yield ()).unsafeRunSync()
  }
