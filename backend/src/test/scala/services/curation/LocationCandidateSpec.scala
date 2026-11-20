package services.curation

import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.file.{Files, Path}
import java.sql.Connection
import java.time.Instant
import java.util.UUID
import javax.imageio.ImageIO

import cats.effect.{IO, Ref, Resource}
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*

import services.curation.api.*
import services.curation.objects.LocationCandidateId
import services.curation.tables.{
  ChatMessageTableInitializer,
  ChatSessionTableInitializer,
  PhotoAnalysisTableInitializer,
  PhotoLocationCandidateTable,
  PhotoLocationCandidateTableInitializer
}
import services.curation.utils.CurrentTime
import services.gallery.objects.*
import services.gallery.objects.apiTypes.PhotoLocationView
import services.gallery.tables.*
import services.system.ai.fake.{FakeReviewModel, FakeTextModel, FakeVisionModel}
import services.system.ai.objects.{LocationCandidateDraft, LocationCandidateDrafts}
import services.system.ai.ports.LocationModel
import services.system.ai.{AiPorts, AiRuntime}
import services.system.api.{ApiException, ErrorCode, ValidationReason}
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Sql, SqlValue, Transaction}
import services.system.startup.AppRuntime
import services.users.objects.UserId

/** 阶段 3 AI 地点候选：suggest（替换候选/失败保留旧候选/非法逐条丢弃）/ list（只读）/ confirm（写 gallery 位置）。
  * 使用真实 momentarium_ai 表与临时图片文件；随机 ID，结束清理。 */
class LocationCandidateSpec extends munit.FunSuite:

  private val aiDatabaseUrl = sys.env.getOrElse("TEST_AI_DB_URL", "jdbc:postgresql://localhost:5432/momentarium_ai")
  private val t0 = Instant.parse("2026-10-30T01:00:00Z")

  test("suggest 多候选：fake 确定性返回 area+仅名称候选，重跑替换候选但不覆盖已确认位置") {
    withFixture { fixture =>
      val scenario = for
        seeded <- seedExhibition(fixture, photoCount = 2)
        first <- databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, seeded.photos.head.id).plan(connection))
        _ <- IO(assert(first.candidates.size >= 2, "fake 应给出多候选"))
        _ <- IO(assertEquals(first.photoId, seeded.photos.head.id))
        _ <- IO(assertEquals(first.model, Some("photo-location-v1")))
        _ <- IO(assert(first.generatedAt.isDefined))
        _ <- IO(assert(first.candidates.exists(_.granularity.isDefined), "至少一条有坐标候选"))
        _ <- IO(assert(first.candidates.exists(_.granularity.isEmpty), "fake 应包含仅名称候选"))
        _ <- IO(assert(first.candidates.forall(_.id.value != UUID.fromString("00000000-0000-0000-0000-000000000000"))))
        areaCandidate = first.candidates.find(_.granularity.contains(LocationGranularity.Area)).getOrElse(fail("缺少有坐标候选"))
        confirmed <- databaseUse(fixture)(connection =>
                       ConfirmPhotoLocationCandidateMessage(seeded.owner, seeded.photos.head.id, areaCandidate.id, "area")
                         .plan(connection)
                     )
        _ <- IO(assertEquals(confirmed.source, LocationSource.Ai))
        _ <- IO(assertEquals(confirmed.status, LocationStatus.Confirmed))
        _ <- IO(assertEquals(confirmed.name, areaCandidate.name))
        _ <- IO(assertEquals(confirmed.latitude, areaCandidate.latitude))
        second <- databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, seeded.photos.head.id).plan(connection))
        _ <- IO(assert(second.candidates.nonEmpty))
        _ <- IO(
               assertEquals(
                 second.candidates.map(_.id).toSet.intersect(first.candidates.map(_.id).toSet),
                 Set.empty[LocationCandidateId],
                 "重跑替换候选、旧 candidateId 不复用"
               )
             )
        locationAfter <- databaseUse(fixture)(connection => PhotoLocationTable.findById(connection, seeded.photos.head.id))
        _ <- IO(assertEquals(locationAfter.map(_.name), Some(areaCandidate.name), "重跑 suggest 不覆盖已确认位置"))
        allCandidates <- databaseUse(fixture)(connection => PhotoLocationCandidateTable.listByPhotoId(connection, seeded.photos.head.id))
        _ <- IO(assertEquals(allCandidates.map(_.id).toSet, second.candidates.map(_.id).toSet, "旧候选被替换"))
      yield ()
      scenario
    }
  }

  test("suggest 无候选：注入空实现返回空数组、model/generatedAt 为 null，旧候选被清空") {
    withFixture { fixture =>
      val scenario = for
        seeded <- seedExhibition(fixture, photoCount = 1)
        _ <- AiRuntime.initializeWith(portsWith((_, _) => IO.pure(LocationCandidateDrafts(Nil))))
        first <- databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, seeded.photos.head.id).plan(connection))
        _ <- IO(assertEquals(first.candidates, Nil))
        _ <- IO(assertEquals(first.model, None))
        _ <- IO(assertEquals(first.generatedAt, None))
        stored <- databaseUse(fixture)(connection => PhotoLocationCandidateTable.listByPhotoId(connection, seeded.photos.head.id))
        _ <- IO(assertEquals(stored, Nil))
      yield ()
      scenario
    }
  }

  test("suggest 模型失败：MODEL_FAILURE 且保留旧候选；非法候选逐条丢弃、全非法 MODEL_FAILURE") {
    withFixture { fixture =>
      val scenario = for
        seeded <- seedExhibition(fixture, photoCount = 1)
        photoId = seeded.photos.head.id
        initial <- databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, photoId).plan(connection))
        _ <- IO(assert(initial.candidates.nonEmpty))
        _ <- AiRuntime.initializeWith(portsWith((_, _) => IO.raiseError(new RuntimeException("模型超时"))))
        failed <- attempt(databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, photoId).plan(connection)))
        _ <- IO(assertEquals(failed.left.toOption.map(_.error.code), Some(ErrorCode.ModelFailure)))
        kept <- databaseUse(fixture)(connection => PhotoLocationCandidateTable.listByPhotoId(connection, photoId))
        _ <- IO(assertEquals(kept.map(_.id).toSet, initial.candidates.map(_.id).toSet, "模型失败保留旧候选"))
        mixed = LocationCandidateDrafts(
                  List(
                    LocationCandidateDraft("", Some(33.4), Some(126.9), Some("area"), "名称非法"),
                    LocationCandidateDraft("合法地点", Some(33.4), Some(126.9), Some("area"), "坐标合法"),
                    LocationCandidateDraft("坐标缺失", None, None, Some("area"), "area 必须有坐标"),
                    LocationCandidateDraft("超范围", Some(91.0), Some(126.9), Some("exact"), "纬度越界")
                  )
                )
        _ <- AiRuntime.initializeWith(portsWith((_, _) => IO.pure(mixed)))
        partial <- databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, photoId).plan(connection))
        _ <- IO(assertEquals(partial.candidates.map(_.name), List("合法地点"), "非法候选逐条丢弃"))
        allInvalid = LocationCandidateDrafts(
                       List(
                         LocationCandidateDraft("", None, None, None, "名称非法"),
                         LocationCandidateDraft("无坐标", None, None, Some("area"), "area 必须有坐标")
                       )
                     )
        _ <- AiRuntime.initializeWith(portsWith((_, _) => IO.pure(allInvalid)))
        allInvalidResult <- attempt(
                              databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, photoId).plan(connection))
                            )
        _ <- IO(assertEquals(allInvalidResult.left.toOption.map(_.error.code), Some(ErrorCode.ModelFailure)))
        keptAfterInvalid <- databaseUse(fixture)(connection => PhotoLocationCandidateTable.listByPhotoId(connection, photoId))
        _ <- IO(assertEquals(keptAfterInvalid.map(_.name), List("合法地点"), "全非法失败保留上一批成功候选"))
      yield ()
      scenario
    }
  }

  test("作者权限与归档：非作者/不存在照片 404；已归档照片 suggest/list 404") {
    withFixture { fixture =>
      val scenario = for
        seeded <- seedExhibition(fixture, photoCount = 1)
        photoId = seeded.photos.head.id
        nonOwner <- attempt(databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.other, photoId).plan(connection)))
        _ <- IO(assertEquals(nonOwner.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        nonOwnerList <- attempt(databaseUse(fixture)(connection => GetPhotoLocationCandidatesMessage(seeded.other, photoId).plan(connection)))
        _ <- IO(assertEquals(nonOwnerList.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        missing <- attempt(databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, PhotoId(UUID.randomUUID())).plan(connection)))
        _ <- IO(assertEquals(missing.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        now <- CurrentTime.now
        _ <- databaseUse(fixture)(connection => ExhibitionPhotoTable.archive(connection, photoId, now))
        archivedSuggest <- attempt(databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, photoId).plan(connection)))
        _ <- IO(assertEquals(archivedSuggest.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        archivedList <- attempt(databaseUse(fixture)(connection => GetPhotoLocationCandidatesMessage(seeded.owner, photoId).plan(connection)))
        _ <- IO(assertEquals(archivedList.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
      yield ()
      scenario
    }
  }

  test("list 只读当前候选且不触发 AI；confirm 无坐标候选仅允许 hidden、area 400，旧 candidateId 404") {
    withFixture { fixture =>
      val scenario = for
        seeded <- seedExhibition(fixture, photoCount = 2)
        photoId = seeded.photos.head.id
        suggested <- databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, photoId).plan(connection))
        _ <- AiRuntime.initializeWith(portsWith((_, _) => IO.raiseError(new RuntimeException("list 不应调用 AI"))))
        listed <- databaseUse(fixture)(connection => GetPhotoLocationCandidatesMessage(seeded.owner, photoId).plan(connection))
        _ <- IO(assertEquals(listed.candidates.map(_.id), suggested.candidates.map(_.id)))
        nameOnly = suggested.candidates.find(_.granularity.isEmpty).getOrElse(fail("fake 缺少仅名称候选"))
        areaInvalid <- attempt(
                         databaseUse(fixture)(connection =>
                           ConfirmPhotoLocationCandidateMessage(seeded.owner, photoId, nameOnly.id, "area").plan(connection)
                         )
                       )
        _ <- IO(
               assertEquals(
                 areaInvalid.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.LocationCoordinatesInvalid))
               )
             )
        hidden <- databaseUse(fixture)(connection =>
                    ConfirmPhotoLocationCandidateMessage(seeded.owner, photoId, nameOnly.id, "hidden").plan(connection)
                  )
        _ <- IO(assertEquals(hidden.granularity, LocationGranularity.Hidden))
        _ <- IO(assertEquals(hidden.latitude, None))
        _ <- IO(assertEquals(hidden.name, nameOnly.name))
        location <- databaseUse(fixture)(connection => PhotoLocationTable.findById(connection, photoId))
        _ <- IO(assertEquals(location.map(_.source), Some(LocationSource.Ai)))
        _ <- IO(assertEquals(location.map(_.status), Some(LocationStatus.Confirmed)))
        _ <- AiRuntime.initializeWith(AiPorts.fake)
        invalidGranularity <- attempt(
                                databaseUse(fixture)(connection =>
                                  ConfirmPhotoLocationCandidateMessage(seeded.owner, photoId, nameOnly.id, "country").plan(connection)
                                )
                              )
        _ <- IO(
               assertEquals(
                 invalidGranularity.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.LocationGranularityInvalid))
               )
             )
        otherPhotoCandidate <- databaseUse(fixture)(connection =>
                                SuggestPhotoLocationMessage(seeded.owner, seeded.photos(1).id).plan(connection)
                              )
        wrongPhoto <- attempt(
                        databaseUse(fixture)(connection =>
                          ConfirmPhotoLocationCandidateMessage(
                            seeded.owner,
                            photoId,
                            otherPhotoCandidate.candidates.head.id,
                            "area"
                          ).plan(connection)
                        )
                      )
        _ <- IO(assertEquals(wrongPhoto.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        replaced <- databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, photoId).plan(connection))
        stale <- attempt(
                   databaseUse(fixture)(connection =>
                     ConfirmPhotoLocationCandidateMessage(seeded.owner, photoId, listed.candidates.head.id, "area").plan(connection)
                   )
                 )
        _ <- IO(assertEquals(stale.left.toOption.map(_.error.code), Some(ErrorCode.NotFound), "重跑后旧 candidateId 不可确认"))
        _ <- IO(assert(replaced.candidates.nonEmpty))
      yield ()
      scenario
    }
  }

  test("confirm 不递增 curationVersion、只刷 updatedAt；候选表初始化幂等") {
    withFixture { fixture =>
      val scenario = for
        seeded <- seedExhibition(fixture, photoCount = 1)
        photoId = seeded.photos.head.id
        before <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, seeded.exhibitionId))
        suggested <- databaseUse(fixture)(connection => SuggestPhotoLocationMessage(seeded.owner, photoId).plan(connection))
        areaCandidate = suggested.candidates.find(_.granularity.isDefined).getOrElse(fail("缺少有坐标候选"))
        _ <- databaseUse(fixture)(connection =>
               ConfirmPhotoLocationCandidateMessage(seeded.owner, photoId, areaCandidate.id, "exact").plan(connection)
             )
        after <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, seeded.exhibitionId))
        _ <- IO(assertEquals(after.map(_.curationVersion), before.map(_.curationVersion), "确认不递增 curationVersion"))
        _ <- IO(assert(after.exists(exhibition => before.exists(old => exhibition.updatedAt.isAfter(old.updatedAt))), "确认刷新 updatedAt"))
        _ <- databaseUse(fixture)(connection => PhotoLocationCandidateTableInitializer.initialize(connection))
        _ <- databaseUse(fixture)(connection => PhotoLocationCandidateTableInitializer.initialize(connection))
        candidates <- databaseUse(fixture)(connection => PhotoLocationCandidateTable.listByPhotoId(connection, photoId))
        _ <- IO(assertEquals(candidates.size, suggested.candidates.size))
      yield ()
      scenario
    }
  }

  // ===== 测试夹具 =====

  private final case class Fixture(
    config: AppConfig,
    dataDirectory: Path,
    database: Database,
    createdExhibitions: Ref[IO, List[ExhibitionId]],
    createdPhotos: Ref[IO, List[PhotoId]]
  )

  private final case class Seeded(
    owner: UserId,
    other: UserId,
    exhibitionId: ExhibitionId,
    groupId: GroupId,
    photos: List[ExhibitionPhoto]
  )

  private def withFixture(body: Fixture => IO[Unit]): Unit =
    temporaryDataDirectory
      .use { dataDirectory =>
        for
          config <- loadConfig(dataDirectory)
          _ <- AiRuntime.initialize(config.ai)
          _ <- Database.resource(config.database).use { database =>
                 for
                   _ <- AppRuntime.initialize(config, database)
                   _ <- initializeTables(database)
                   exhibitions <- IO.ref(List.empty[ExhibitionId])
                   photos <- IO.ref(List.empty[PhotoId])
                   current = Fixture(config, dataDirectory, database, exhibitions, photos)
                   _ <- body(current).guarantee(cleanup(current))
                 yield ()
               }
        yield ()
      }
      .unsafeRunSync()

  private def seedExhibition(fixture: Fixture, photoCount: Int): IO[Seeded] =
    for
      owner <- IO.randomUUID.map(UserId.apply)
      other <- IO.randomUUID.map(UserId.apply)
      exhibitionId = ExhibitionId(UUID.randomUUID())
      groupId = GroupId(UUID.randomUUID())
      photoIds <- List.fill(photoCount)(IO.randomUUID.map(PhotoId.apply)).sequence
      jpeg <- sampleJpegBytes
      exhibition = Exhibition(
                     id = exhibitionId,
                     ownerId = owner,
                     title = "AI 地点候选展",
                     narrative = "测试地点候选",
                     curationVersion = 7,
                     coverKind = CoverKind.Auto,
                     coverPhotoId = None,
                     coverStorageKey = None,
                     coverMime = None,
                     coverWidth = None,
                     coverHeight = None,
                     createdAt = t0,
                     updatedAt = t0
                   )
      group = ExhibitionGroup(groupId, exhibitionId, "海边", "", 0)
      photos = photoIds.zipWithIndex.map { case (photoId, index) =>
                 ExhibitionPhoto(
                   id = photoId,
                   exhibitionId = exhibitionId,
                   storageKey = s"${exhibitionId.value}/${photoId.value}.jpg",
                   thumbKey = s"${exhibitionId.value}/${photoId.value}.thumb.jpg",
                   originalName = s"photo-$index.jpg",
                   mime = "image/jpeg",
                   width = Some(320),
                   height = Some(240),
                   groupId = Some(groupId),
                   positionInGroup = Some(index),
                   caption = "",
                   archivedAt = None,
                   createdAt = t0
                 )
               }
      _ <- databaseUse(fixture) { connection =>
             for
               _ <- ExhibitionTable.insert(connection, exhibition)
               _ <- ExhibitionGroupTable.insert(connection, group)
               _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
             yield ()
           }
      _ <- photos.traverse_(photo => writeFile(fixture.dataDirectory.resolve(photo.storageKey), jpeg))
      _ <- fixture.createdExhibitions.update(_ :+ exhibitionId)
      _ <- fixture.createdPhotos.update(_ :+ photos.head.id)
      _ <- photos.drop(1).traverse_(photo => fixture.createdPhotos.update(_ :+ photo.id))
    yield Seeded(owner, other, exhibitionId, groupId, photos)

  private def initializeTables(database: Database): IO[Unit] =
    val initializers = List(
      ExhibitionTableInitializer.initialize,
      ExhibitionGroupTableInitializer.initialize,
      ExhibitionPhotoTableInitializer.initialize,
      PhotoLocationTableInitializer.initialize,
      PhotoAnalysisTableInitializer.initialize,
      ChatSessionTableInitializer.initialize,
      ChatMessageTableInitializer.initialize,
      PhotoLocationCandidateTableInitializer.initialize
    )
    database.use(connection => Transaction(connection)(initializers.traverse_(initialize => initialize(connection))))

  private def reasonOf(exception: ApiException): Option[String] =
    exception.error.details.flatMap(_.apply("reason")).flatMap(_.asString)

  private def portsWith(location: LocationModel): AiPorts =
    AiPorts(FakeTextModel(), FakeVisionModel(), location, FakeReviewModel())

  private def databaseUse[A](fixture: Fixture)(action: Connection => IO[A]): IO[A] =
    fixture.database.use(action)

  private def attempt[A](action: IO[A]): IO[Either[ApiException, A]] =
    action.attempt.map {
      case Right(value) => Right(value)
      case Left(error: ApiException) => Left(error)
      case Left(other) => throw other
    }

  private def cleanup(fixture: Fixture): IO[Unit] =
    for
      exhibitionIds <- fixture.createdExhibitions.get
      photoIds <- fixture.createdPhotos.get
      _ <-
        if exhibitionIds.isEmpty && photoIds.isEmpty then IO.unit
        else
          fixture.database.use { connection =>
            val photoArray = photoIds.map(_.value.toString).mkString("{", ",", "}")
            for
              _ <- Sql.update(
                     connection,
                     "DELETE FROM curation.photo_location_candidates WHERE photo_id = ANY(?::uuid[])",
                     List(SqlValue.Text(photoArray))
                   )
              _ <- Sql.update(
                     connection,
                     "DELETE FROM gallery.photo_locations WHERE photo_id = ANY(?::uuid[])",
                     List(SqlValue.Text(photoArray))
                   )
              _ <- Sql.update(
                     connection,
                     "DELETE FROM curation.photo_analyses WHERE photo_id = ANY(?::uuid[])",
                     List(SqlValue.Text(photoArray))
                   )
              _ <- exhibitionIds.traverse_(id =>
                     Sql.update(connection, "DELETE FROM gallery.exhibitions WHERE id = ?", List(SqlValue.Uuid(id.value)))
                   )
            yield ()
          }
    yield ()

  private def loadConfig(dataDirectory: Path): IO[AppConfig] =
    DotEnv.load(Path.of(".env")).flatMap { dotEnv =>
      val environment = dotEnv ++ sys.env ++ Map(
        "DB_URL" -> aiDatabaseUrl,
        "DATA_DIR" -> dataDirectory.toString,
        "AI_MODE" -> "fake"
      )
      AppConfig.load(environment) match
        case Right(config) => IO.pure(config)
        case Left(error) => IO.raiseError(new IllegalStateException(s"测试配置无效：$error"))
    }

  private def temporaryDataDirectory: Resource[IO, Path] =
    Resource.make(IO.blocking(Files.createTempDirectory("momentarium-location-candidate-")))(deleteDirectory)

  private def deleteDirectory(directory: Path): IO[Unit] =
    IO.blocking {
      import scala.jdk.CollectionConverters.*
      if Files.exists(directory) then
        val paths = Files.walk(directory).iterator().asScala.toList.sortBy(_.getNameCount).reverse
        paths.foreach(path => Files.deleteIfExists(path))
        ()
    }

  private def writeFile(path: Path, bytes: Array[Byte]): IO[Unit] =
    IO.blocking {
      Option(path.getParent).foreach(parent => Files.createDirectories(parent))
      Files.write(path, bytes)
      ()
    }

  private def sampleJpegBytes: IO[Array[Byte]] =
    IO.blocking {
      val image = new BufferedImage(320, 240, BufferedImage.TYPE_INT_RGB)
      val graphics = image.createGraphics()
      graphics.setColor(new Color(180, 120, 80))
      graphics.fillRect(0, 0, 320, 240)
      graphics.dispose()
      val output = new ByteArrayOutputStream()
      ImageIO.write(image, "jpeg", output)
      output.toByteArray
    }
