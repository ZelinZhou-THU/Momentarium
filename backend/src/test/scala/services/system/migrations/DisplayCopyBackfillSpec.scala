package services.system.migrations

import java.nio.file.{Files, Path}
import java.time.Instant
import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*
import io.circe.parser.parse

import services.gallery.api.{GetExhibitionCoverMessage, GetPhotoContentMessage}
import services.gallery.objects.*
import services.gallery.objects.apiTypes.DisplayCopyBackfillReport
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable, PublicationTable}
import services.gallery.utils.ExifJpegs
import services.system.api.{ApiException, ErrorCode}
import services.system.config.{AppConfig, DotEnv}
import services.system.db.Database
import services.system.startup.Initializers
import services.users.objects.UserId

/** P0-B2 回填入口集成验收（只允许 *_test 测试库 + 临时 DATA_DIR）：
  *   1. 旧数据：有原图与缩略图、无展示副本；run 后生成副本，匿名 full 可读且无 EXIF；
  *   2. 二次 run：全部跳过（幂等），不重写已有副本；
  *   3. 生成失败的路径（原图缺失）回填后仍不可用，匿名读取 INTERNAL 且不回退原图；补回原图后可重跑修复；
  *   4. render 封面（草稿 + active 快照引用）含 EXIF 时重编码，二次运行跳过。
  */
class DisplayCopyBackfillSpec extends munit.FunSuite:
  private val expectedCorners = List("BLUE", "RED", "WHITE", "GREEN")

  test("历史展示副本回填：生成无 EXIF 副本、二次运行幂等、失败路径可重跑修复") {
    val databaseUrl = sys.env.getOrElse("DB_URL", fail("必须显式设置 DB_URL=jdbc:postgresql://localhost:5432/momentarium_test 运行本测试"))
    assert(databaseUrl.endsWith("_test"), s"本测试只允许连接 *_test 测试库，实际：$databaseUrl")

    (for
      dotEnv <- DotEnv.load(Path.of(".env"))
      dataDirectory <- IO.blocking(Files.createTempDirectory("momentarium-backfill-"))
      config <- IO.fromEither(
                  AppConfig
                    .load(dotEnv ++ sys.env ++ Map("DATA_DIR" -> dataDirectory.toString))
                    .left
                    .map(message => new IllegalStateException(message))
                )
      _ <- Database
             .resource(config.database)
             .use(database => runScenario(database, config))
             .guarantee(deleteDirectory(dataDirectory))
    yield ()).unsafeRunSync()
  }

  private def runScenario(database: Database, config: AppConfig): IO[Unit] =
    val dataDirectory = config.dataDir
    val ownerId = UserId(UUID.randomUUID())
    val now = Instant.parse("2026-11-02T12:00:00Z")
    val legacyExhibitionId = ExhibitionId(UUID.randomUUID())
    val draftRenderExhibitionId = ExhibitionId(UUID.randomUUID())
    val snapshotRenderExhibitionId = ExhibitionId(UUID.randomUUID())
    val sourceJpeg = ExifJpegs.withGpsExif(ExifJpegs.jpeg(ExifJpegs.quadrants(1200, 800)), 6)

    val scenario = for
      _ <- Initializers.run(database)
      legacyPhotos = List(legacyPhotoOf(legacyExhibitionId, 1, now), legacyPhotoOf(legacyExhibitionId, 2, now))
      brokenPhoto = legacyPhotoOf(legacyExhibitionId, 3, now).copy(storageKey = s"${legacyExhibitionId.value}/missing-3.jpg")
      _ <- database.use(connection =>
             ExhibitionTable.insert(connection, exhibitionOf(legacyExhibitionId, ownerId, CoverKind.Auto, None, now))
           )
      _ <- database.use(connection => (legacyPhotos :+ brokenPhoto).traverse_(photo => ExhibitionPhotoTable.insert(connection, photo)))
      _ <- (legacyPhotos :+ brokenPhoto).traverse_(photo => writeFile(dataDirectory, photo.thumbKey, Array[Byte](0)))
      _ <- legacyPhotos.traverse_(photo => writeFile(dataDirectory, photo.storageKey, sourceJpeg))
      originalBytes <- legacyPhotos.traverse(photo => readFile(dataDirectory, photo.storageKey))
      publication = publicationOf(legacyExhibitionId, legacyPhotos :+ brokenPhoto, autoCover(legacyPhotos.head), now)
      _ <- database.use(connection => PublicationTable.insert(connection, publication))

      draftRenderKey = s"renders/${draftRenderExhibitionId.value}/${UUID.randomUUID()}.jpg"
      _ <- writeFile(dataDirectory, draftRenderKey, sourceJpeg)
      _ <- database.use(connection =>
             ExhibitionTable.insert(
               connection,
               exhibitionOf(draftRenderExhibitionId, ownerId, CoverKind.Render, Some(draftRenderKey), now)
             )
           )

      snapshotRenderKey = s"renders/${snapshotRenderExhibitionId.value}/${UUID.randomUUID()}.jpg"
      _ <- writeFile(dataDirectory, snapshotRenderKey, sourceJpeg)
      _ <- database.use(connection =>
             ExhibitionTable.insert(connection, exhibitionOf(snapshotRenderExhibitionId, ownerId, CoverKind.Auto, None, now))
           )
      _ <- database.use(connection =>
             PublicationTable.insert(
               connection,
               publicationOf(snapshotRenderExhibitionId, Nil, renderCover(snapshotRenderKey), now)
             )
           )
      originalRenderBytes <- readFile(dataDirectory, draftRenderKey)

      baselinePhotoCount <- database.use(connection => ExhibitionPhotoTable.listAll(connection).map(_.size))

      // 1. 第一次回填：生成缺失副本、重编码含元数据的 render 封面。
      first <- BackfillDisplayCopies.execute(database, config)
      _ <- IO(assertEquals(first.report.photosTotal, baselinePhotoCount))
      _ <- IO(assert(first.report.photosGenerated >= legacyPhotos.size))
      _ <- IO(assert(first.report.photoFailures.exists(_.subject == brokenPhoto.id.value.toString), "应记录原图缺失的照片失败"))
      _ <- IO(assert(!first.report.photoFailures.exists(failure => legacyPhotos.exists(_.id.value.toString == failure.subject))))
      _ <- IO(assert(first.report.rendersReencoded >= 2, s"render 重编码数不足：${first.report.rendersReencoded}"))
      _ <- IO(
             assert(
               !first.report.renderFailures.exists(failure =>
                 List(draftRenderKey, snapshotRenderKey).exists(key => key.endsWith(failure.subject))
               ),
               s"本次 render 封面不应失败：${first.report.renderFailures}"
             )
           )

      displayBytes <- legacyPhotos.traverse(photo => readFile(dataDirectory, displayKeyOf(photo)))
      _ <- displayBytes.traverse_(bytes => IO(assert(!ExifJpegs.hasExif(bytes), "回填展示副本不得携带 EXIF")))
      _ <- displayBytes.traverse_(bytes => IO(assertEquals(ExifJpegs.dimensions(bytes), (800, 1200))))
      _ <- displayBytes.traverse_(bytes => IO(assertEquals(ExifJpegs.corners(bytes), expectedCorners)))
      afterOriginals <- legacyPhotos.traverse(photo => readFile(dataDirectory, photo.storageKey))
      _ <- IO(assertEquals(afterOriginals.map(_.toList), originalBytes.map(_.toList), "回填不得修改原图"))
      _ <- IO(assert(ExifJpegs.hasExif(afterOriginals.head), "原图应保留 EXIF"))
      _ <- IO(assert(!exists(dataDirectory, displayKeyOf(brokenPhoto)), "原图缺失时不应生成展示副本"))

      draftRenderBytes <- readFile(dataDirectory, draftRenderKey)
      _ <- IO(assertNotEquals(draftRenderBytes.toList, originalRenderBytes.toList, "草稿 render 封面应被重编码"))
      _ <- IO(assert(!ExifJpegs.hasExif(draftRenderBytes), "草稿 render 封面不得携带 EXIF"))
      _ <- IO(assertEquals(ExifJpegs.corners(draftRenderBytes), expectedCorners))
      snapshotRenderBytes <- readFile(dataDirectory, snapshotRenderKey)
      _ <- IO(assert(!ExifJpegs.hasExif(snapshotRenderBytes), "快照 render 封面不得携带 EXIF"))

      // auto/photo 封面复用照片展示副本；render 封面读取重编码后的冻结文件。
      autoCoverBytes <- database.use(connection =>
                          GetExhibitionCoverMessage(None, legacyExhibitionId, dataDirectory).plan(connection)
                        )
      _ <- IO(assertEquals(autoCoverBytes.bytes.toList, displayBytes.head.toList))
      _ <- IO(assert(!ExifJpegs.hasExif(autoCoverBytes.bytes), "auto 封面不得携带 EXIF"))
      draftCoverBytes <- database.use(connection =>
                           GetExhibitionCoverMessage(Some(ownerId), draftRenderExhibitionId, dataDirectory).plan(connection)
                         )
      _ <- IO(assertEquals(draftCoverBytes.bytes.toList, draftRenderBytes.toList))
      _ <- IO(assert(!ExifJpegs.hasExif(draftCoverBytes.bytes), "草稿 render 封面读取不得携带 EXIF"))
      snapshotCoverBytes <- database.use(connection =>
                              GetExhibitionCoverMessage(None, snapshotRenderExhibitionId, dataDirectory).plan(connection)
                            )
      _ <- IO(assertEquals(snapshotCoverBytes.bytes.toList, snapshotRenderBytes.toList))
      _ <- IO(assert(!ExifJpegs.hasExif(snapshotCoverBytes.bytes), "公开快照 render 封面读取不得携带 EXIF"))

      markerJson <- readFile(dataDirectory, s"migrations/${BackfillDisplayCopies.MigrationName}.json")
      parsedMarker <- IO.fromEither(parse(new String(markerJson, java.nio.charset.StandardCharsets.UTF_8)).left.map(message =>
                        new IllegalStateException(s"完成标记不是合法 JSON：$message")
                      ))
      markerMigration <- IO.fromEither(parsedMarker.hcursor.get[String]("migration").left.map(new IllegalStateException(_)))
      markerSummary <- IO.fromEither(
                         parsedMarker.hcursor.get[DisplayCopyBackfillReport]("summary").left.map(new IllegalStateException(_))
                       )
      _ <- IO(assertEquals(markerMigration, BackfillDisplayCopies.MigrationName))
      _ <- IO(assertEquals(markerSummary, first.report))
      _ <- IO(assertEquals(first.markerPath, dataDirectory.resolve("migrations").resolve(s"${BackfillDisplayCopies.MigrationName}.json")))

      // 迁移后匿名 full 可读展示副本；原图缺失的照片仍返回 INTERNAL，不回退原图。
      anonymousFull <- database.use(connection =>
                         GetPhotoContentMessage(None, legacyPhotos.head.id, PhotoVariant.Full, dataDirectory).plan(connection)
                       )
      _ <- IO(assertEquals(anonymousFull.mimeType, "image/jpeg"))
      _ <- IO(assertEquals(anonymousFull.bytes.toList, displayBytes.head.toList))
      _ <- IO(assert(!ExifJpegs.hasExif(anonymousFull.bytes), "匿名 full 不得携带 EXIF"))
      _ <- assertUnavailable(
             database.use(connection =>
               GetPhotoContentMessage(None, brokenPhoto.id, PhotoVariant.Full, dataDirectory).plan(connection)
             ),
             "照片展示副本不可用",
             "原图缺失的照片迁移后匿名读取"
           )

      // 2. 第二次回填：全部按存在性跳过，不重写已有副本。
      displayBytesBeforeSecond <- legacyPhotos.traverse(photo => readFile(dataDirectory, displayKeyOf(photo)))
      second <- BackfillDisplayCopies.execute(database, config)
      displayBytesAfterSecond <- legacyPhotos.traverse(photo => readFile(dataDirectory, displayKeyOf(photo)))
      _ <- IO(assertEquals(second.report.photosTotal, baselinePhotoCount))
      _ <- IO(assertEquals(second.report.photosGenerated, 0))
      _ <- IO(assertEquals(second.report.photosSkipped, second.report.photosTotal - second.report.photoFailures.size))
      _ <- IO(assertEquals(second.report.rendersReencoded, 0))
      _ <- IO(assertEquals(second.report.rendersSkipped, second.report.rendersTotal - second.report.renderFailures.size))
      _ <- IO(assertEquals(displayBytesAfterSecond.map(_.toList), displayBytesBeforeSecond.map(_.toList), "二次运行不得重写展示副本"))

      // 3. 失败路径修复后可重跑：补回原图 → 再次运行生成该照片的展示副本，匿名读取恢复。
      _ <- writeFile(dataDirectory, brokenPhoto.storageKey, sourceJpeg)
      third <- BackfillDisplayCopies.execute(database, config)
      _ <- IO(assert(third.report.photosGenerated >= 1, "补回原图后重跑应补生成展示副本"))
      repaired <- readFile(dataDirectory, displayKeyOf(brokenPhoto))
      _ <- IO(assert(!ExifJpegs.hasExif(repaired), "重跑生成的展示副本不得携带 EXIF"))
      recovered <- database.use(connection =>
                     GetPhotoContentMessage(None, brokenPhoto.id, PhotoVariant.Full, dataDirectory).plan(connection)
                   )
      _ <- IO(assertEquals(recovered.bytes.toList, repaired.toList))
    yield ()

    scenario.guarantee(
      database
        .use(connection =>
          List(legacyExhibitionId, draftRenderExhibitionId, snapshotRenderExhibitionId)
            .traverse_(id => ExhibitionTable.delete(connection, id, ownerId))
        )
        .attempt
        .void
    )

  private def legacyPhotoOf(exhibitionId: ExhibitionId, index: Int, now: Instant): ExhibitionPhoto =
    ExhibitionPhoto(
      id = PhotoId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      storageKey = s"${exhibitionId.value}/legacy-$index.jpg",
      thumbKey = s"${exhibitionId.value}/legacy-$index.thumb.jpg",
      originalName = s"legacy-$index.jpg",
      mime = "image/jpeg",
      width = Some(800),
      height = Some(1200),
      groupId = None,
      positionInGroup = None,
      caption = s"旧照片 $index",
      archivedAt = None,
      createdAt = now
    )

  private def exhibitionOf(
    id: ExhibitionId,
    ownerId: UserId,
    coverKind: CoverKind,
    renderStorageKey: Option[String],
    now: Instant
  ): Exhibition =
    Exhibition(
      id = id,
      ownerId = ownerId,
      title = "回填测试",
      narrative = "",
      curationVersion = 0,
      coverKind = coverKind,
      coverPhotoId = None,
      coverStorageKey = renderStorageKey,
      coverMime = renderStorageKey.map(_ => "image/jpeg"),
      coverWidth = renderStorageKey.map(_ => 800),
      coverHeight = renderStorageKey.map(_ => 1200),
      createdAt = now,
      updatedAt = now
    )

  private def autoCover(photo: ExhibitionPhoto): SnapshotCover =
    SnapshotCover(CoverKind.Auto, Some(photo.id), None, None, None, 800, 1200)

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
        title = "回填测试",
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

  /** 展示副本 key 约定（P0-B1）：{exhibitionId}/{photoId}.display.jpg；此处按约定定位以验证产物。 */
  private def displayKeyOf(photo: ExhibitionPhoto): String =
    s"${photo.exhibitionId.value}/${photo.id.value}.display.jpg"

  private def writeFile(dataDirectory: Path, relativeKey: String, bytes: Array[Byte]): IO[Path] =
    IO.blocking {
      val target = dataDirectory.resolve(relativeKey)
      Option(target.getParent).foreach(parent => Files.createDirectories(parent))
      Files.write(target, bytes)
    }

  private def readFile(dataDirectory: Path, relativeKey: String): IO[Array[Byte]] =
    IO.blocking(Files.readAllBytes(dataDirectory.resolve(relativeKey)))

  private def exists(dataDirectory: Path, relativeKey: String): Boolean =
    Files.isRegularFile(dataDirectory.resolve(relativeKey))

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
