package services.gallery.api

import java.nio.file.{Files, Path}
import java.time.Instant
import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*
import io.circe.parser.decode
import io.circe.syntax.*

import services.gallery.objects.*
import services.gallery.objects.apiTypes.{PhotoLocationView, PublicPhotoLocation}
import services.gallery.tables.*
import services.gallery.utils.{ExifJpegs, PublicationViews}
import services.scene.objects.{SceneBrief, SceneRun, SceneRunId, SceneRunStatus, SceneSource}
import services.scene.tables.{SceneRunTable, SceneRunTableInitializer}
import services.system.api.{ApiException, ErrorCode, ValidationReason}
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Sql, SqlValue, Transaction}
import services.users.objects.UserId

/** 阶段 1 位置与地图后端：
  *   - 位置三态写入、校验 reason、越权/不存在 404、清除幂等；
  *   - 作者详情 suggested/confirmed 与展示顺序；位置写入不递增 curation_version、sceneStale 不变；
  *   - 发布冻结公开位置、公开视图只含 confirmed+非 hidden、旧快照缺字段兼容、hasUnpublishedChanges 公开投影；
  *   - 上传时本地解析 JPEG EXIF GPS 写 suggested 行；PNG/无 GPS 不建行。
  */
class PhotoLocationSpec extends munit.FunSuite:
  test("位置写入/校验/详情顺序/发布冻结/公开投影与旧快照兼容") {
    withTestDatabase("momentarium-photo-location-")((database, _, _) => runLocationScenario(database))
  }

  test("上传时本地解析 JPEG EXIF GPS 写 suggested 行，PNG 与无 GPS JPEG 不建行") {
    withTestDatabase("momentarium-photo-location-upload-")((database, _, dataDirectory) =>
      runUploadScenario(database, dataDirectory)
    )
  }

  private def withTestDatabase(prefix: String)(scenario: (Database, AppConfig, Path) => IO[Unit]): Unit =
    val databaseUrl = sys.env.getOrElse("DB_URL", fail("必须显式设置 DB_URL=jdbc:postgresql://localhost:5432/momentarium_test 运行本测试"))
    assert(databaseUrl.endsWith("_test"), s"本测试只允许连接 *_test 测试库，实际：$databaseUrl")
    (for
      dotEnv <- DotEnv.load(Path.of(".env"))
      dataDirectory <- IO.blocking(Files.createTempDirectory(prefix))
      config <- IO.fromEither(
                  AppConfig
                    .load(dotEnv ++ sys.env ++ Map("DATA_DIR" -> dataDirectory.toString))
                    .left
                    .map(message => new IllegalStateException(message))
                )
      _ <- Database
             .resource(config.database)
             .use { database =>
               for
                 _ <- initializeTables(database)
                 _ <- scenario(database, config, dataDirectory)
               yield ()
             }
             .guarantee(deleteDirectory(dataDirectory))
    yield ()).unsafeRunSync()

  private def runLocationScenario(database: Database): IO[Unit] =
    val ownerId = UserId(UUID.randomUUID())
    val strangerId = UserId(UUID.randomUUID())
    val now = Instant.parse("2026-11-02T12:00:00Z")
    val exhibitionId = ExhibitionId(UUID.randomUUID())
    val groupId = GroupId(UUID.randomUUID())
    val photos = (0 until 4).toList.map(index => photoOf(exhibitionId, groupId, index, now))
    val run = succeededRun(ownerId, exhibitionId, photos.map(_.id), curationVersion = 1, now)

    val scenario = for
      _ <- database.use { connection =>
             for
               _ <- ExhibitionTable.insert(connection, exhibitionOf(exhibitionId, ownerId, curationVersion = 1, now))
               _ <- ExhibitionGroupTable.insert(connection, ExhibitionGroup(groupId, exhibitionId, "章一", "", 0))
               _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
               _ <- SceneRunTable.insert(connection, run)
               _ <- ExhibitionTable.setCurrentSceneRun(connection, exhibitionId, run.id, now)
             yield ()
           }
      initialDetail <- detail(database, ownerId, exhibitionId)
      _ <- IO(assert(initialDetail.locations.isEmpty, "初始无位置记录"))
      _ <- IO(assertEquals(initialDetail.sceneStale, false))

      // 1. 三态写入：hidden 仅有名称、area/exact 必须有坐标；写入即 confirmed/manual。
      hidden <- setLocation(database, ownerId, photos(0).id, "济州岛", None, None, "hidden")
      _ <- IO(assertEquals((hidden.source, hidden.status, hidden.granularity), (LocationSource.Manual, LocationStatus.Confirmed, LocationGranularity.Hidden)))
      _ <- IO(assertEquals((hidden.latitude, hidden.longitude), (None, None)))
      area <- setLocation(database, ownerId, photos(1).id, "涉地可支", Some(33.4592), Some(126.936), "area")
      _ <- IO(assertEquals(area.granularity, LocationGranularity.Area))
      exact <- setLocation(database, ownerId, photos(2).id, "城山日出峰", Some(33.4587), Some(126.9422), "exact")
      _ <- IO(assertEquals(exact.granularity, LocationGranularity.Exact))

      // 2. 校验 reason 与越权/不存在。
      _ <- assertValidation(database, ownerId, photos(0).id, "", None, None, "hidden", ValidationReason.LocationNameInvalid, "空名称")
      _ <- assertValidation(database, ownerId, photos(0).id, "地" * 121, None, None, "hidden", ValidationReason.LocationNameInvalid, "超长名称")
      _ <- assertValidation(database, ownerId, photos(0).id, "只给纬度", Some(33.4), None, "hidden", ValidationReason.LocationCoordinatesInvalid, "坐标不成对")
      _ <- assertValidation(database, ownerId, photos(0).id, "越界", Some(91.0), Some(126.0), "area", ValidationReason.LocationCoordinatesInvalid, "纬度越界")
      _ <- assertValidation(database, ownerId, photos(0).id, "未知粒度", Some(33.4), Some(126.9), "region", ValidationReason.LocationGranularityInvalid, "非法粒度")
      _ <- assertValidation(database, ownerId, photos(0).id, "缺坐标", None, None, "area", ValidationReason.LocationGranularityInvalid, "area 缺坐标")
      _ <- assertApiError(
             database.use(connection =>
               SetPhotoLocationMessage(strangerId, photos(0).id, "越权", Some(33.4), Some(126.9), "exact").plan(connection)
             ),
             ErrorCode.NotFound,
             "他人写入位置"
           )
      _ <- assertApiError(
             database.use(connection =>
               SetPhotoLocationMessage(ownerId, PhotoId(UUID.randomUUID()), "不存在", Some(33.4), Some(126.9), "exact").plan(connection)
             ),
             ErrorCode.NotFound,
             "不存在照片写入位置"
           )
      _ <- assertApiError(
             database.use(connection => ClearPhotoLocationMessage(strangerId, photos(0).id).plan(connection)),
             ErrorCode.NotFound,
             "他人清除位置"
           )

      // 3. 作者详情位置按照片展示顺序返回，位置写入不递增 curation_version、sceneStale 不变。
      _ <- IO(assertEquals(hidden.photoId, photos(0).id))
      afterWrites <- detail(database, ownerId, exhibitionId)
      _ <- IO(assertEquals(afterWrites.locations.map(_.photoId), List(photos(0).id, photos(1).id, photos(2).id)))
      _ <- IO(assertEquals(afterWrites.locations.map(_.name), List("济州岛", "涉地可支", "城山日出峰")))
      _ <- IO(assertEquals(afterWrites.sceneStale, false))
      _ <- IO(assert(afterWrites.updatedAt.isAfter(initialDetail.updatedAt), "位置写入应刷新 updatedAt"))
      exhibitionRow <- database.use(connection => ExhibitionTable.findById(connection, exhibitionId))
      _ <- IO(assertEquals(exhibitionRow.map(_.curationVersion), Some(1)))
      _ <- IO(assertEquals(afterWrites.hasUnpublishedChanges, false))

      // 4. 清除位置幂等；无记录后详情不再出现该照片。
      _ <- database.use(connection => ClearPhotoLocationMessage(ownerId, photos(0).id).plan(connection))
      _ <- database.use(connection => ClearPhotoLocationMessage(ownerId, photos(0).id).plan(connection))
      cleared <- detail(database, ownerId, exhibitionId)
      _ <- IO(assertEquals(cleared.locations.map(_.photoId), List(photos(1).id, photos(2).id)))

      // 5. 发布冻结公开位置：photo0 exact、photo1 area 进入快照；photo2 只有 suggested、photo3 无记录，不进入。
      _ <- setLocation(database, ownerId, photos(0).id, "涉地可支", Some(33.4592), Some(126.936), "exact")
      _ <- seedSuggestedLocation(database, photos(2).id, 37.55, 126.9667, now)
      published <- database.use(connection => PublishExhibitionMessage(ownerId, exhibitionId).plan(connection))
      _ <- IO(assertEquals(published.version, 1))
      active <- database.use(connection => PublicationTable.findActive(connection, exhibitionId))
      snapshotLocations = active.flatMap(_.snapshot.locations).getOrElse(fail("快照应包含 locations"))
      _ <- IO(assertEquals(snapshotLocations.map(_.photoId), List(photos(0).id, photos(1).id)))
      _ <- IO(assertEquals(snapshotLocations.map(_.granularity), List(LocationGranularity.Exact, LocationGranularity.Area)))
      _ <- IO(assertEquals(snapshotLocations.map(_.name), List("涉地可支", "涉地可支")))

      publicView <- database.use(connection => GetPublishedExhibitionMessage(exhibitionId).plan(connection))
      _ <- IO(assertEquals(publicView.locations.map(_.photoId), List(photos(0).id, photos(1).id)))
      _ <- IO(assertEquals(publicView.locations.map(_.granularity), List(LocationGranularity.Exact, LocationGranularity.Area)))
      _ <- IO(assert(publicView.locations.forall(location => location.granularity != LocationGranularity.Hidden)))

      // 6. hasUnpublishedChanges 只比较公开位置投影：hidden/suggested 变化不标记，area 坐标变化标记。
      _ <- setLocation(database, ownerId, photos(2).id, "内部备注", None, None, "hidden")
      afterHidden <- detail(database, ownerId, exhibitionId)
      _ <- IO(assertEquals(afterHidden.hasUnpublishedChanges, false))
      _ <- database.use(connection => ClearPhotoLocationMessage(ownerId, photos(2).id).plan(connection))
      afterClear <- detail(database, ownerId, exhibitionId)
      _ <- IO(assertEquals(afterClear.hasUnpublishedChanges, false))
      _ <- setLocation(database, ownerId, photos(1).id, "涉地可支范围", Some(33.46), Some(126.94), "area")
      afterPublicChange <- detail(database, ownerId, exhibitionId)
      _ <- IO(assertEquals(afterPublicChange.hasUnpublishedChanges, true))

      // 7. 旧快照没有 locations 字段：解码为 None，公开视图位置为空数组。
      legacySnapshot = active.get.snapshot.copy(locations = None)
      legacyJson = legacySnapshot.asJson.deepDropNullValues.noSpaces
      _ <- IO(assert(!legacyJson.contains("locations"), "旧快照 JSON 不应包含 locations"))
      decodedLegacy <- IO.fromEither(decode[PublicationSnapshot](legacyJson).left.map(new IllegalStateException(_)))
      _ <- IO(assertEquals(decodedLegacy.locations, None))
      legacyView = PublicationViews.publicView(active.get.copy(snapshot = decodedLegacy), None)
      _ <- IO(assertEquals(legacyView.locations, Nil))
    yield ()

    scenario.guarantee(
      database
        .use { connection =>
          for
            _ <- Sql.update(
                   connection,
                   "DELETE FROM scene.scene_runs WHERE requested_by = ?",
                   List(SqlValue.Uuid(ownerId.value))
                 )
            _ <- ExhibitionTable.delete(connection, exhibitionId, ownerId)
          yield ()
        }
        .attempt
        .void
    )

  private def runUploadScenario(database: Database, dataDirectory: Path): IO[Unit] =
    val ownerId = UserId(UUID.randomUUID())
    val exhibitionId = ExhibitionId(UUID.randomUUID())
    val now = Instant.parse("2026-11-02T12:00:00Z")
    val jpegWithGps = ExifJpegs.withGpsExif(ExifJpegs.jpeg(ExifJpegs.quadrants(320, 240)), 6)
    val plainJpeg = ExifJpegs.jpeg(ExifJpegs.quadrants(320, 240))
    val pngBytes = createPng(320, 240)

    val scenario = for
      _ <- database.use(connection => ExhibitionTable.insert(connection, exhibitionOf(exhibitionId, ownerId, curationVersion = 0, now)))
      uploadedGps <- upload(database, ownerId, exhibitionId, dataDirectory, "gps.jpg", jpegWithGps, "image/jpeg")
      uploadedPlain <- upload(database, ownerId, exhibitionId, dataDirectory, "plain.jpg", plainJpeg, "image/jpeg")
      uploadedPng <- upload(database, ownerId, exhibitionId, dataDirectory, "photo.png", pngBytes, "image/png")
      gpsLocation <- database.use(connection => PhotoLocationTable.findById(connection, uploadedGps.id))
      plainLocation <- database.use(connection => PhotoLocationTable.findById(connection, uploadedPlain.id))
      pngLocation <- database.use(connection => PhotoLocationTable.findById(connection, uploadedPng.id))
      _ <- IO(assertEquals(gpsLocation.map(_.source), Some(LocationSource.Exif)))
      _ <- IO(assertEquals(gpsLocation.map(_.status), Some(LocationStatus.Suggested)))
      _ <- IO(assertEquals(gpsLocation.map(_.name), Some("")))
      _ <- IO(assertEquals(gpsLocation.map(_.granularity), Some(LocationGranularity.Hidden)))
      _ <- IO(assertEqualsDouble(gpsLocation.flatMap(_.latitude).getOrElse(0.0), 37.55, 1e-9))
      _ <- IO(assertEqualsDouble(gpsLocation.flatMap(_.longitude).getOrElse(0.0), 126.0 + 58.0 / 60.0, 1e-9))
      _ <- IO(assertEquals(plainLocation, None))
      _ <- IO(assertEquals(pngLocation, None))
      // 建议位置为 hidden，不进入公开快照/公开视图（无发布时仅验证作者视图可见）。
      detailAfter <- detail(database, ownerId, exhibitionId)
      _ <- IO(assertEquals(detailAfter.locations.map(_.photoId), List(uploadedGps.id)))
      _ <- IO(assertEquals(detailAfter.locations.map(_.status), List(LocationStatus.Suggested)))
    yield ()

    scenario.guarantee(
      database
        .use(connection => ExhibitionTable.delete(connection, exhibitionId, ownerId))
        .attempt
        .void
    )

  private def upload(
    database: Database,
    ownerId: UserId,
    exhibitionId: ExhibitionId,
    dataDirectory: Path,
    fileName: String,
    bytes: Array[Byte],
    contentType: String
  ): IO[ExhibitionPhoto] =
    for
      candidate <- candidateFile(dataDirectory, fileName, bytes, contentType)
      response <- database.use(connection =>
                    UploadPhotosMessage(ownerId, exhibitionId, dataDirectory, List(candidate)).plan(connection)
                  )
      _ <- IO(assertEquals(response.failures, Nil))
      photo <- database.use(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibitionId)).map { photos =>
                 val matched = photos.find(_.originalName == fileName)
                 matched.getOrElse(fail(s"未找到上传照片 $fileName"))
               }
    yield photo

  private def setLocation(
    database: Database,
    ownerId: UserId,
    photoId: PhotoId,
    name: String,
    latitude: Option[Double],
    longitude: Option[Double],
    granularity: String
  ): IO[PhotoLocationView] =
    database.use(connection =>
      SetPhotoLocationMessage(ownerId, photoId, name, latitude, longitude, granularity).plan(connection)
    )

  private def detail(database: Database, ownerId: UserId, exhibitionId: ExhibitionId) =
    database.use(connection => GetExhibitionMessage(ownerId, exhibitionId).plan(connection))

  private def seedSuggestedLocation(
    database: Database,
    photoId: PhotoId,
    latitude: Double,
    longitude: Double,
    now: Instant
  ): IO[Unit] =
    database.use(connection =>
      PhotoLocationTable.upsert(
        connection,
        PhotoLocation(
          photoId = photoId,
          source = LocationSource.Exif,
          status = LocationStatus.Suggested,
          name = "",
          latitude = Some(latitude),
          longitude = Some(longitude),
          granularity = LocationGranularity.Hidden,
          updatedAt = now
        )
      )
    )

  private def assertValidation(
    database: Database,
    ownerId: UserId,
    photoId: PhotoId,
    name: String,
    latitude: Option[Double],
    longitude: Option[Double],
    granularity: String,
    expected: ValidationReason,
    context: String
  ): IO[Unit] =
    database
      .use(connection => SetPhotoLocationMessage(ownerId, photoId, name, latitude, longitude, granularity).plan(connection))
      .attempt
      .map {
        case Left(ApiException(error)) =>
          assertEquals(error.code, ErrorCode.Validation, context)
          assertEquals(
            error.details.flatMap(_.apply("reason")).flatMap(_.asString),
            Some(ValidationReason.toString(expected)),
            context
          )
        case other => fail(s"$context 期望 VALIDATION(${ValidationReason.toString(expected)})，实际: $other")
      }

  private def assertApiError(action: IO[?], expectedCode: ErrorCode, context: String): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) => assertEquals(error.code, expectedCode, context)
      case other => fail(s"$context 期望 $expectedCode，实际: $other")
    }

  private def initializeTables(database: Database): IO[Unit] =
    val initializers = List(
      ExhibitionTableInitializer.initialize,
      ExhibitionGroupTableInitializer.initialize,
      ExhibitionPhotoTableInitializer.initialize,
      PhotoLocationTableInitializer.initialize,
      PublicationTableInitializer.initialize,
      SceneRunTableInitializer.initialize
    )
    database.use(connection => Transaction(connection)(initializers.traverse_(initialize => initialize(connection))))

  private def exhibitionOf(id: ExhibitionId, ownerId: UserId, curationVersion: Int, now: Instant): Exhibition =
    Exhibition(
      id = id,
      ownerId = ownerId,
      title = "位置测试",
      narrative = "",
      curationVersion = curationVersion,
      coverKind = CoverKind.Auto,
      coverPhotoId = None,
      coverStorageKey = None,
      coverMime = None,
      coverWidth = None,
      coverHeight = None,
      createdAt = now,
      updatedAt = now
    )

  private def photoOf(exhibitionId: ExhibitionId, groupId: GroupId, index: Int, now: Instant): ExhibitionPhoto =
    ExhibitionPhoto(
      id = PhotoId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      storageKey = s"${exhibitionId.value}/photo-$index.jpg",
      thumbKey = s"${exhibitionId.value}/photo-$index.thumb.jpg",
      originalName = s"photo-$index.jpg",
      mime = "image/jpeg",
      width = Some(1024),
      height = Some(683),
      groupId = Some(groupId),
      positionInGroup = Some(index),
      caption = s"图注 $index",
      archivedAt = None,
      createdAt = now
    )

  private def succeededRun(
    ownerId: UserId,
    exhibitionId: ExhibitionId,
    photoIds: List[PhotoId],
    curationVersion: Int,
    createdAt: Instant
  ): SceneRun =
    SceneRun(
      id = SceneRunId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      requestedBy = ownerId,
      status = SceneRunStatus.Succeeded,
      source = Some(SceneSource.Ai),
      hint = None,
      photoIds = photoIds,
      curationVersion = curationVersion,
      runtimeVersion = "1",
      brief = Some(SceneBrief("安静", "海。", "场景", "导语", List("#0B1020"), Nil, None)),
      code = Some("function build(ctx) {}"),
      review = None,
      runtimeEvidence = None,
      attempts = 0,
      promptVersion = "scene-parent-v1",
      errorCode = None,
      errorMessage = None,
      createdAt = createdAt,
      updatedAt = createdAt
    )

  private def candidateFile(
    dataDirectory: Path,
    fileName: String,
    bytes: Array[Byte],
    contentType: String
  ): IO[UploadCandidate] =
    IO.blocking {
      val directory = dataDirectory.resolve("incoming")
      Files.createDirectories(directory)
      val path = Files.createTempFile(directory, "candidate-", ".upload")
      Files.write(path, bytes)
      UploadCandidate(fileName, Some(contentType), path)
    }

  private def createPng(width: Int, height: Int): Array[Byte] =
    val image = new java.awt.image.BufferedImage(width, height, java.awt.image.BufferedImage.TYPE_INT_RGB)
    val output = new java.io.ByteArrayOutputStream()
    javax.imageio.ImageIO.write(image, "png", output)
    output.toByteArray

  private def deleteDirectory(directory: Path): IO[Unit] =
    IO.blocking {
      import scala.jdk.CollectionConverters.*
      if Files.exists(directory) then
        val paths = Files.walk(directory).iterator().asScala.toList.sortBy(_.getNameCount).reverse
        paths.foreach(path => Files.deleteIfExists(path))
        ()
    }
