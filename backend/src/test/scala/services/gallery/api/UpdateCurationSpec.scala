package services.gallery.api

import java.nio.file.Path
import java.time.Instant
import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*

import services.gallery.objects.{CoverKind, Exhibition, ExhibitionId, ExhibitionPhoto, PhotoId}
import services.gallery.objects.apiTypes.{ExhibitionPhotoInput, GroupInput}
import services.gallery.tables.{
  ExhibitionGroupTableInitializer,
  ExhibitionPhotoTable,
  ExhibitionPhotoTableInitializer,
  ExhibitionTable,
  ExhibitionTableInitializer,
  PhotoLocationTableInitializer,
  PublicationTableInitializer
}
import services.scene.tables.SceneRunTableInitializer
import services.system.api.{ApiException, ErrorCode, ValidationReason}
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Transaction}
import services.users.objects.UserId

class UpdateCurationSpec extends munit.FunSuite:
  test("updatecuration 单事务整体替换章节与照片编排、version 递增、校验与越权返回契约错误") {
    (for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message)))
      _ <- Database.resource(config.database).use { database =>
             for
               _ <- initializeGalleryTables(database)
               _ <- database.use(connection => runScenario(connection))
             yield ()
           }
    yield ()).unsafeRunSync()
  }

  private def initializeGalleryTables(database: Database): IO[Unit] =
    val initializers = List(
      ExhibitionTableInitializer.initialize,
      ExhibitionGroupTableInitializer.initialize,
      ExhibitionPhotoTableInitializer.initialize,
      PhotoLocationTableInitializer.initialize,
      PublicationTableInitializer.initialize,
      SceneRunTableInitializer.initialize
    )
    database.use(connection => Transaction(connection)(initializers.traverse_(initialize => initialize(connection))))

  private def runScenario(connection: java.sql.Connection): IO[Unit] =
    val ownerId = UserId(UUID.randomUUID())
    val otherOwnerId = UserId(UUID.randomUUID())
    val now = Instant.parse("2026-10-27T10:00:00Z")
    val exhibitionId = ExhibitionId(UUID.randomUUID())
    val photos = List(photoOf(exhibitionId, 1, now), photoOf(exhibitionId, 2, now), photoOf(exhibitionId, 3, now))
    val twoPhotoExhibitionId = ExhibitionId(UUID.randomUUID())
    val twoPhotos = List(photoOf(twoPhotoExhibitionId, 1, now), photoOf(twoPhotoExhibitionId, 2, now))

    (for
      _ <- ExhibitionTable.insert(connection, exhibitionOf(exhibitionId, ownerId, now))
      _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
      _ <- ExhibitionTable.insert(connection, exhibitionOf(twoPhotoExhibitionId, ownerId, now))
      _ <- twoPhotos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))

      first <- UpdateCurationMessage(
                 ownerId,
                 exhibitionId,
                 "济州的风",
                 "海边的记忆",
                 List(
                   GroupInput("抵达", "第一天", List(ExhibitionPhotoInput(photos.head.id, "海边"))),
                   GroupInput("离开", "最后一天", List(ExhibitionPhotoInput(photos(1).id, "日落"), ExhibitionPhotoInput(photos(2).id, "街道")))
                 )
               ).plan(connection)
      _ <- IO(assertEquals(first.title, "济州的风"))
      _ <- IO(assertEquals(first.narrative, "海边的记忆"))
      _ <- IO(assertEquals(first.groups.map(_.title), List("抵达", "离开")))
      _ <- IO(assertEquals(first.groups.map(_.position), List(0, 1)))
      _ <- IO(assertEquals(first.groups.head.photos.map(_.id), List(photos.head.id)))
      _ <- IO(assertEquals(first.groups.last.photos.map(_.id), List(photos(1).id, photos(2).id)))
      _ <- IO(assertEquals(first.groups.last.photos.map(_.positionInGroup), List(Some(0), Some(1))))
      _ <- IO(assertEquals(first.groups.last.photos.head.caption, "日落"))
      _ <- IO(assertEquals(first.ungroupedPhotos, Nil))
      storedAfterFirst <- ExhibitionTable.findById(connection, exhibitionId)
      _ <- IO(assertEquals(storedAfterFirst.map(_.curationVersion), Some(1)))

      second <- UpdateCurationMessage(
                  ownerId,
                  exhibitionId,
                  "济州的风",
                  "海边的记忆",
                  List(
                    GroupInput("重排章", "", List(ExhibitionPhotoInput(photos(2).id, "街道"), ExhibitionPhotoInput(photos.head.id, "海边"))),
                    GroupInput("末章", "", List(ExhibitionPhotoInput(photos(1).id, "日落")))
                  )
                ).plan(connection)
      _ <- IO(assertEquals(second.groups.map(_.title), List("重排章", "末章")))
      _ <- IO(assertEquals(second.groups.head.photos.map(_.id), List(photos(2).id, photos.head.id)))
      storedAfterSecond <- ExhibitionTable.findById(connection, exhibitionId)
      _ <- IO(assertEquals(storedAfterSecond.map(_.curationVersion), Some(2)))

      _ <- assertError(
             UpdateCurationMessage(
               ownerId,
               exhibitionId,
               "济州的风",
               "",
               List(
                 GroupInput(
                   "x",
                   "",
                   photos.map(photo => ExhibitionPhotoInput(photo.id, "")) :+ ExhibitionPhotoInput(PhotoId(UUID.randomUUID()), "")
                 )
               )
             ).plan(connection),
             ErrorCode.NotFound,
             "未知 photoId"
           )
      _ <- assertError(
             UpdateCurationMessage(
               ownerId,
               exhibitionId,
               "济州的风",
               "",
               List(
                 GroupInput("x", "", List(ExhibitionPhotoInput(photos.head.id, ""))),
                 GroupInput("y", "", List(ExhibitionPhotoInput(photos.head.id, ""), ExhibitionPhotoInput(photos(1).id, ""), ExhibitionPhotoInput(photos(2).id, "")))
               )
             ).plan(connection),
             ErrorCode.BadRequest,
             "重复 photoId"
           )
      _ <- assertReason(
             UpdateCurationMessage(
               ownerId,
               exhibitionId,
               "济州的风",
               "",
               List(
                 GroupInput("x", "", photos.map(photo => ExhibitionPhotoInput(photo.id, ""))),
                 GroupInput("空章", "", Nil)
               )
             ).plan(connection),
             ValidationReason.GroupEmpty,
             "空章节"
           )
      _ <- assertReason(
             UpdateCurationMessage(
               ownerId,
               exhibitionId,
               "济州的风",
               "",
               List(GroupInput("x", "", List(ExhibitionPhotoInput(photos.head.id, ""), ExhibitionPhotoInput(photos(1).id, ""))))
             ).plan(connection),
             ValidationReason.PhotoUngrouped,
             "存在未分组照片"
           )
      _ <- assertReason(
             UpdateCurationMessage(
               ownerId,
               twoPhotoExhibitionId,
               "只有两张",
               "",
               List(GroupInput("x", "", twoPhotos.map(photo => ExhibitionPhotoInput(photo.id, ""))))
             ).plan(connection),
             ValidationReason.PhotoCount,
             "照片不足 3 张"
           )
      _ <- assertReason(
             UpdateCurationMessage(
               ownerId,
               exhibitionId,
               "   ",
               "",
               List(GroupInput("x", "", photos.map(photo => ExhibitionPhotoInput(photo.id, ""))))
             ).plan(connection),
             ValidationReason.TitleRequired,
             "空标题"
           )
      _ <- assertError(
             UpdateCurationMessage(
               otherOwnerId,
               exhibitionId,
               "hack",
               "",
               List(GroupInput("x", "", photos.map(photo => ExhibitionPhotoInput(photo.id, ""))))
             ).plan(connection),
             ErrorCode.NotFound,
             "他人展览"
           )
    yield ()).guarantee(
      (ExhibitionTable.delete(connection, exhibitionId, ownerId) *>
        ExhibitionTable.delete(connection, twoPhotoExhibitionId, ownerId)).void
    )

  private def assertError(action: IO[?], expectedCode: ErrorCode, context: String): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) => assertEquals(error.code, expectedCode, context)
      case other => fail(s"$context 期望 $expectedCode，实际: $other")
    }

  private def assertReason(action: IO[?], expectedReason: ValidationReason, context: String): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) =>
        assertEquals(error.code, ErrorCode.Validation, context)
        val reason = error.details.flatMap(_.apply("reason")).flatMap(_.asString)
        assertEquals(reason, Some(ValidationReason.toString(expectedReason)), context)
      case other => fail(s"$context 期望 VALIDATION(${ValidationReason.toString(expectedReason)})，实际: $other")
    }

  private def exhibitionOf(exhibitionId: ExhibitionId, ownerId: UserId, now: Instant): Exhibition =
    Exhibition(
      id = exhibitionId,
      ownerId = ownerId,
      title = "草稿",
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

  private def photoOf(exhibitionId: ExhibitionId, index: Int, now: Instant): ExhibitionPhoto =
    ExhibitionPhoto(
      id = PhotoId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      storageKey = s"test/$exhibitionId/$index.jpg",
      thumbKey = s"test/$exhibitionId/$index.thumb.jpg",
      originalName = s"photo-$index.jpg",
      mime = "image/jpeg",
      width = Some(1600),
      height = Some(1067),
      groupId = None,
      positionInGroup = None,
      caption = "",
      archivedAt = None,
      createdAt = now
    )
