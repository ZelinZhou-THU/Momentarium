package services.gallery.api

import java.nio.file.{Files, Path}
import java.time.Instant
import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*

import services.gallery.objects.*
import services.gallery.tables.{
  ExhibitionGroupTableInitializer,
  ExhibitionPhotoTable,
  ExhibitionPhotoTableInitializer,
  ExhibitionTable,
  ExhibitionTableInitializer,
  PublicationTable,
  PublicationTableInitializer
}
import services.gallery.utils.{CoverRenderFiles, ExifJpegs, PhotoStorage}
import services.system.api.{ApiException, ErrorCode}
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Transaction}
import services.users.objects.UserId

/** P0-B1 去元数据公开副本管线：
  *   1. 上传生成方向纠正、无 EXIF/GPS 的 JPEG 展示副本，原图保留；
  *   2. 匿名/非作者大图与 auto/photo/render 封面只返回展示副本；
  *   3. 作者私有读取仍取原图；副本缺失返回 INTERNAL 不可用且不回退原图。
  */
class DisplayCopySpec extends munit.FunSuite:
  test("公开读取只返回无元数据展示副本；作者保留原图；副本缺失返回不可用") {
    (for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message)))
      dataDirectory = Files.createTempDirectory("momentarium-display-copy-")
      _ <- Database
             .resource(config.database)
             .use { database =>
               for
                 _ <- initializeTables(database)
                 _ <- runScenario(database, dataDirectory)
               yield ()
             }
             .guarantee(deleteDirectory(dataDirectory))
    yield ()).unsafeRunSync()
  }

  private def runScenario(database: Database, dataDirectory: Path): IO[Unit] =
    val ownerId = UserId(UUID.randomUUID())
    val strangerId = UserId(UUID.randomUUID())
    val now = Instant.parse("2026-11-02T12:00:00Z")
    val autoExhibitionId = ExhibitionId(UUID.randomUUID())
    val photoExhibitionId = ExhibitionId(UUID.randomUUID())
    val renderExhibitionId = ExhibitionId(UUID.randomUUID())
    val missingExhibitionId = ExhibitionId(UUID.randomUUID())
    val exhibitionIds = List(autoExhibitionId, photoExhibitionId, renderExhibitionId, missingExhibitionId)
    // 1200×800、Orientation=6（顺时针 90°）、带 GPS IFD：纠正后应为 800×1200。
    val sourceJpeg = ExifJpegs.withGpsExif(ExifJpegs.jpeg(ExifJpegs.quadrants(1200, 800)), 6)
    val expectedCorners = List("BLUE", "RED", "WHITE", "GREEN")

    val scenario = for
      _ <- database.use(connection =>
             exhibitionIds.traverse_(id => ExhibitionTable.insert(connection, exhibitionOf(id, ownerId, now)))
           )
      autoPhotos <- uploadPhotos(database, ownerId, autoExhibitionId, dataDirectory, List(("auto.jpg", sourceJpeg)))
      photoPhotos <- uploadPhotos(
                       database,
                       ownerId,
                       photoExhibitionId,
                       dataDirectory,
                       List(("first.jpg", sourceJpeg), ("second.jpg", sourceJpeg))
                     )
      missingPhotos <- uploadPhotos(database, ownerId, missingExhibitionId, dataDirectory, List(("missing.jpg", sourceJpeg)))

      // 1. 上传即生成展示副本：方向纠正、去 EXIF；原图字节保留 EXIF。
      autoPhoto = autoPhotos.head
      displayKey = PhotoStorage.displayKey(autoPhoto.exhibitionId, autoPhoto.id)
      displayBytes <- PhotoStorage.read(dataDirectory, displayKey)
      originalBytes <- PhotoStorage.read(dataDirectory, autoPhoto.storageKey)
      _ <- IO(assertEquals((autoPhoto.width, autoPhoto.height), (Some(800), Some(1200))))
      _ <- IO(assert(ExifJpegs.hasExif(originalBytes), "原图应保留 EXIF/GPS（私有）"))
      _ <- IO(assert(!ExifJpegs.hasExif(displayBytes), "展示副本不得携带 EXIF"))
      _ <- IO(assertEquals(ExifJpegs.dimensions(displayBytes), (800, 1200)))
      _ <- IO(assertEquals(ExifJpegs.corners(displayBytes), expectedCorners))
      _ <- IO(assertNotEquals(displayBytes.toList, originalBytes.toList))

      // 2. active 快照引用后，匿名/非作者大图只读展示副本。
      firstPhoto = photoPhotos.find(_.originalName == "first.jpg").getOrElse(fail("缺少 first.jpg"))
      secondPhoto = photoPhotos.find(_.originalName == "second.jpg").getOrElse(fail("缺少 second.jpg"))
      _ <- database.use(connection =>
             PublicationTable
               .insert(connection, publicationOf(autoExhibitionId, autoPhotos, autoCover(autoPhoto), now)) *>
               PublicationTable.insert(
                 connection,
                 publicationOf(photoExhibitionId, photoPhotos, photoCover(secondPhoto), now)
               ) *>
               PublicationTable.insert(
                 connection,
                 publicationOf(missingExhibitionId, missingPhotos, autoCover(missingPhotos.head), now)
               )
           )

      anonymousFull <- database.use(connection =>
                         GetPhotoContentMessage(None, autoPhoto.id, PhotoVariant.Full, dataDirectory).plan(connection)
                       )
      _ <- IO(assertEquals(anonymousFull.mimeType, "image/jpeg"))
      _ <- IO(assertEquals(anonymousFull.bytes.toList, displayBytes.toList))
      _ <- IO(assert(!ExifJpegs.hasExif(anonymousFull.bytes), "匿名大图不得携带 EXIF"))
      _ <- IO(assertEquals(ExifJpegs.corners(anonymousFull.bytes), expectedCorners))

      strangerFull <- database.use(connection =>
                        GetPhotoContentMessage(Some(strangerId), autoPhoto.id, PhotoVariant.Full, dataDirectory).plan(connection)
                      )
      _ <- IO(assertEquals(strangerFull.bytes.toList, displayBytes.toList))

      ownerFull <- database.use(connection =>
                     GetPhotoContentMessage(Some(ownerId), autoPhoto.id, PhotoVariant.Full, dataDirectory).plan(connection)
                   )
      _ <- IO(assertEquals(ownerFull.bytes.toList, originalBytes.toList))
      _ <- IO(assert(ExifJpegs.hasExif(ownerFull.bytes), "作者私有读取应保留原图"))

      // 3. auto/photo 封面匿名读取只返回对应照片的展示副本。
      autoCoverBytes <- anonymousCover(database, autoExhibitionId, dataDirectory)
      autoDisplayBytes <- PhotoStorage.read(dataDirectory, PhotoStorage.displayKey(autoPhoto.exhibitionId, autoPhoto.id))
      _ <- IO(assertEquals(autoCoverBytes.bytes.toList, autoDisplayBytes.toList))
      _ <- IO(assert(!ExifJpegs.hasExif(autoCoverBytes.bytes), "auto 封面不得携带 EXIF"))

      photoCoverBytes <- anonymousCover(database, photoExhibitionId, dataDirectory)
      photoDisplayBytes <- PhotoStorage.read(
                            dataDirectory,
                            PhotoStorage.displayKey(secondPhoto.exhibitionId, secondPhoto.id)
                          )
      _ <- IO(assertEquals(photoCoverBytes.bytes.toList, photoDisplayBytes.toList))
      _ <- IO(assert(!ExifJpegs.hasExif(photoCoverBytes.bytes), "photo 封面不得携带 EXIF"))

      // 4. render 封面上传即重编码：存储文件与匿名读取都不含元数据，且方向已纠正。
      renderCandidate <- candidateFile(dataDirectory, "render.jpg", sourceJpeg)
      uploadedRender <- database.use(connection =>
                          UploadCoverRenderMessage(ownerId, renderExhibitionId, dataDirectory, renderCandidate).plan(connection)
                        )
      _ <- IO(assertEquals((uploadedRender.width, uploadedRender.height), (800, 1200)))
      renderKey = UUID.fromString(uploadedRender.renderKey)
      renderStorageKey = CoverRenderFiles.storageKey(renderExhibitionId, renderKey, PhotoFormat.Jpeg)
      renderBytes <- PhotoStorage.read(dataDirectory, renderStorageKey)
      _ <- IO(assert(!ExifJpegs.hasExif(renderBytes), "render 封面存储文件不得携带 EXIF"))
      _ <- IO(assertEquals(ExifJpegs.corners(renderBytes), expectedCorners))
      _ <- database.use(connection =>
             PublicationTable.insert(connection, publicationOf(renderExhibitionId, Nil, renderCover(renderStorageKey), now))
           )
      publicRender <- anonymousCover(database, renderExhibitionId, dataDirectory)
      _ <- IO(assertEquals(publicRender.bytes.toList, renderBytes.toList))
      _ <- IO(assert(!ExifJpegs.hasExif(publicRender.bytes), "公开 render 封面不得携带 EXIF"))

      // 5. 副本缺失：公开读取返回不可用错误，不回退原图；作者私有读取不受影响。
      _ <- PhotoStorage.delete(dataDirectory, List(PhotoStorage.displayKey(missingPhotos.head.exhibitionId, missingPhotos.head.id)))
      _ <- assertUnavailable(
             database.use(connection =>
               GetPhotoContentMessage(None, missingPhotos.head.id, PhotoVariant.Full, dataDirectory).plan(connection)
             ),
             "照片展示副本不可用",
             "匿名大图副本缺失"
           )
      _ <- assertUnavailable(
             database.use(connection => GetExhibitionCoverMessage(None, missingExhibitionId, dataDirectory).plan(connection)),
             "封面展示副本不可用",
             "auto 封面副本缺失"
           )
      missingOriginalBytes <- PhotoStorage.read(dataDirectory, missingPhotos.head.storageKey)
      ownerAfterDeletion <- database.use(connection =>
                             GetPhotoContentMessage(Some(ownerId), missingPhotos.head.id, PhotoVariant.Full, dataDirectory)
                               .plan(connection)
                           )
      _ <- IO(assertEquals(ownerAfterDeletion.bytes.toList, missingOriginalBytes.toList))
    yield ()

    scenario.guarantee(
      database
        .use(connection => exhibitionIds.traverse_(id => ExhibitionTable.delete(connection, id, ownerId)))
        .attempt
        .void
    )

  private def uploadPhotos(
    database: Database,
    ownerId: UserId,
    exhibitionId: ExhibitionId,
    dataDirectory: Path,
    files: List[(String, Array[Byte])]
  ): IO[List[ExhibitionPhoto]] =
    for
      candidates <- files.traverse { case (fileName, bytes) => candidateFile(dataDirectory, fileName, bytes) }
      response <- database.use(connection =>
                    UploadPhotosMessage(ownerId, exhibitionId, dataDirectory, candidates).plan(connection)
                  )
      _ <- IO(assertEquals(response.failures, Nil))
      photos <- database.use(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibitionId))
      _ <- IO(assertEquals(photos.size, files.size))
    yield photos

  private def candidateFile(dataDirectory: Path, fileName: String, bytes: Array[Byte]): IO[UploadCandidate] =
    IO.blocking {
      val directory = dataDirectory.resolve("incoming")
      Files.createDirectories(directory)
      val path = Files.createTempFile(directory, "candidate-", ".upload")
      Files.write(path, bytes)
      UploadCandidate(fileName, Some("image/jpeg"), path)
    }

  private def anonymousCover(
    database: Database,
    exhibitionId: ExhibitionId,
    dataDirectory: Path
  ): IO[PhotoContent] =
    database.use(connection => GetExhibitionCoverMessage(None, exhibitionId, dataDirectory).plan(connection))

  private def initializeTables(database: Database): IO[Unit] =
    val initializers = List(
      ExhibitionTableInitializer.initialize,
      ExhibitionGroupTableInitializer.initialize,
      ExhibitionPhotoTableInitializer.initialize,
      PublicationTableInitializer.initialize
    )
    database.use(connection => Transaction(connection)(initializers.traverse_(initialize => initialize(connection))))

  private def exhibitionOf(id: ExhibitionId, ownerId: UserId, now: Instant): Exhibition =
    Exhibition(
      id = id,
      ownerId = ownerId,
      title = "展示副本测试",
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

  private def autoCover(photo: ExhibitionPhoto): SnapshotCover =
    SnapshotCover(CoverKind.Auto, Some(photo.id), None, None, None, 800, 1200)

  private def photoCover(photo: ExhibitionPhoto): SnapshotCover =
    SnapshotCover(CoverKind.Photo, Some(photo.id), None, None, None, 800, 1200)

  private def renderCover(storageKey: String): SnapshotCover =
    SnapshotCover(CoverKind.Render, None, None, Some(storageKey), Some("image/jpeg"), 800, 1200)

  private def publicationOf(
    exhibitionId: ExhibitionId,
    photos: List[ExhibitionPhoto],
    cover: SnapshotCover,
    now: Instant
  ): Publication =
    Publication(
      id = PublicationId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      version = 1,
      snapshot = PublicationSnapshot(
        version = 1,
        publishedAt = now,
        curationVersion = 0,
        title = "展示副本测试",
        narrative = "",
        narration = "",
        cover = cover,
        groups = Nil,
        photos = photos.map(photo =>
          SnapshotPhoto(
            photo.id,
            photo.originalName,
            photo.mime,
            photo.width.getOrElse(0),
            photo.height.getOrElse(0),
            photo.caption,
            photo.groupId,
            photo.positionInGroup,
            None
          )
        ),
        sceneRunId = None,
        sceneCode = None,
        sceneRuntimeVersion = None,
        sceneGeneratedAt = None,
        scenePalette = None
      ),
      status = PublicationStatus.Active,
      createdAt = now,
      supersededAt = None
    )

  private def assertUnavailable(action: IO[?], expectedMessage: String, context: String): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) =>
        assertEquals(error.code, ErrorCode.Internal, context)
        assertEquals(error.message, expectedMessage, context)
      case other => fail(s"$context 期望 INTERNAL($expectedMessage)，实际: $other")
    }

  private def deleteDirectory(directory: Path): IO[Unit] =
    IO.blocking {
      import scala.jdk.CollectionConverters.*
      if Files.exists(directory) then
        val paths = Files.walk(directory).iterator().asScala.toList.sortBy(_.getNameCount).reverse
        paths.foreach(path => Files.deleteIfExists(path))
        ()
    }
