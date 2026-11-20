package services.gallery.tables

import java.nio.file.Path
import java.time.Instant
import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*

import services.gallery.objects.{CoverKind, Exhibition, ExhibitionGroup, ExhibitionId, ExhibitionPhoto, GroupId, PhotoId}
import services.system.api.{ApiException, ErrorCode}
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Sql, SqlValue, Transaction}
import services.users.objects.UserId

class GalleryTablesSpec extends munit.FunSuite:
  private val rollbackToken = new RuntimeException("gallery-tables-test-rollback")

  test("gallery 三表初始化后完成展览/章节/照片读写，越权与不存在均 NOT_FOUND") {
    val program = for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message)))
      _ <- Database.resource(config.database).use { database =>
             for
               _ <- initializeGalleryTables(database)
               outcome <- database.use(connection =>
                            Transaction(connection)(writeAndRead(connection) *> IO.raiseError(rollbackToken)).attempt
                          )
               _ <- outcome match
                      case Left(error) if error.eq(rollbackToken) => IO.unit
                      case Left(error) => IO.raiseError(error)
                      case Right(_) => IO.raiseError(new IllegalStateException("测试事务未按预期回滚"))
             yield ()
           }
    yield ()

    program.unsafeRunSync()
  }

  test("cover_kind 与发布快照的非法存储值解码失败而不是静默降级") {
    val program = for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message)))
      _ <- Database.resource(config.database).use { database =>
             for
               _ <- initializeGalleryAndPublicationTables(database)
               outcome <- database.use(connection =>
                            Transaction(connection)(corruptAndDecode(connection) *> IO.raiseError(rollbackToken)).attempt
                          )
               _ <- outcome match
                      case Left(error) if error.eq(rollbackToken) => IO.unit
                      case Left(error) => IO.raiseError(error)
                      case Right(_) => IO.raiseError(new IllegalStateException("测试事务未按预期回滚"))
             yield ()
           }
    yield ()

    program.unsafeRunSync()
  }

  private def initializeGalleryTables(database: Database): IO[Unit] =
    val initializers = List(
      ExhibitionTableInitializer.initialize,
      ExhibitionGroupTableInitializer.initialize,
      ExhibitionPhotoTableInitializer.initialize
    )
    database.use(connection => Transaction(connection)(initializers.traverse_(initialize => initialize(connection))))

  private def initializeGalleryAndPublicationTables(database: Database): IO[Unit] =
    val initializers = List(
      ExhibitionTableInitializer.initialize,
      ExhibitionGroupTableInitializer.initialize,
      ExhibitionPhotoTableInitializer.initialize,
      PublicationTableInitializer.initialize
    )
    database.use(connection => Transaction(connection)(initializers.traverse_(initialize => initialize(connection))))

  /** 注入非法 cover_kind 与结构不匹配的 snapshot_json，断言读取失败并报出 表.列 位置。 */
  private def corruptAndDecode(connection: java.sql.Connection): IO[Unit] =
    val now = Instant.parse("2026-10-27T08:00:00Z")
    val ownerId = UserId(UUID.randomUUID())
    val exhibition = Exhibition(
      ExhibitionId(UUID.randomUUID()),
      ownerId,
      "解码失败的展览",
      "用于严格解码测试",
      0,
      CoverKind.Auto,
      None,
      None,
      None,
      None,
      None,
      now,
      now
    )

    for
      _ <- ExhibitionTable.insert(connection, exhibition)
      _ <- Sql.update(
             connection,
             "UPDATE gallery.exhibitions SET cover_kind = 'bogus' WHERE id = ?",
             List(SqlValue.Uuid(exhibition.id.value))
           )
      coverOutcome <- ExhibitionTable.findById(connection, exhibition.id).attempt
      _ = assertDecodeFailure(coverOutcome, "gallery.exhibitions.cover_kind")
      _ <- Sql.update(
             connection,
             """INSERT INTO gallery.publications
               |  (id, exhibition_id, version, snapshot_json, status, created_at, superseded_at)
               |VALUES (?, ?, 1, '{"x":1}'::jsonb, 'active', ?, NULL)""".stripMargin,
             List(SqlValue.Uuid(UUID.randomUUID()), SqlValue.Uuid(exhibition.id.value), SqlValue.InstantValue(now))
           )
      snapshotOutcome <- PublicationTable.findActive(connection, exhibition.id).attempt
      _ = assertDecodeFailure(snapshotOutcome, "gallery.publications.snapshot_json")
    yield ()

  private def assertDecodeFailure(outcome: Either[Throwable, ?], reportedColumn: String): Unit =
    outcome match
      case Left(error: IllegalStateException) => assert(error.getMessage.contains(reportedColumn))
      case other                              => fail(s"损坏存储值应触发解码失败（$reportedColumn），实际: $other")

  private def writeAndRead(connection: java.sql.Connection): IO[Unit] =
    val now = Instant.parse("2026-10-27T08:00:00Z")
    val ownerId = UserId(UUID.randomUUID())
    val exhibition = Exhibition(
      ExhibitionId(UUID.randomUUID()),
      ownerId,
      "济州岛的夏天",
      "海风与黄昏",
      0,
      CoverKind.Auto,
      None,
      None,
      None,
      None,
      None,
      now,
      now
    )
    val group = ExhibitionGroup(GroupId(UUID.randomUUID()), exhibition.id, "海边", "日落", 1)
    val photo = ExhibitionPhoto(
      PhotoId(UUID.randomUUID()),
      exhibition.id,
      "data/platform/exhibition/full.jpg",
      "data/platform/exhibition/thumb.jpg",
      "jeju-01.jpg",
      "image/jpeg",
      Some(2048),
      Some(1365),
      Some(group.id),
      Some(1),
      "海风",
      None,
      now
    )

    for
      _ <- ExhibitionTable.insert(connection, exhibition)
      loaded <- ExhibitionTable.findById(connection, exhibition.id)
      _ <- IO(assertEquals(loaded, Some(exhibition)))
      owned <- ExhibitionTable.requireOwned(connection, exhibition.id, ownerId)
      _ <- IO(assertEquals(owned, exhibition))
      otherOwner <- ExhibitionTable.requireOwned(connection, exhibition.id, UserId(UUID.randomUUID())).attempt
      _ <- IO(assertNotFound(otherOwner, "他人访问展览"))
      missing <- ExhibitionTable.requireOwned(connection, ExhibitionId(UUID.randomUUID()), ownerId).attempt
      _ <- IO(assertNotFound(missing, "不存在的展览"))
      _ <- ExhibitionGroupTable.insert(connection, group)
      groups <- ExhibitionGroupTable.listByExhibition(connection, exhibition.id)
      _ <- IO(assertEquals(groups, List(group)))
      _ <- ExhibitionPhotoTable.insert(connection, photo)
      photos <- ExhibitionPhotoTable.listByExhibition(connection, exhibition.id)
      _ <- IO(assertEquals(photos, List(photo)))
      foundPhoto <- ExhibitionPhotoTable.findById(connection, photo.id)
      _ <- IO(assertEquals(foundPhoto, Some(photo)))
      count <- ExhibitionPhotoTable.countByExhibition(connection, exhibition.id)
      _ <- IO(assertEquals(count, 1))
      _ <- ExhibitionTable.touchDraft(connection, exhibition.id, now.plusSeconds(60))
      touched <- ExhibitionTable.findById(connection, exhibition.id)
      _ <- IO(assertEquals(touched.map(_.curationVersion), Some(1)))
    yield ()

  private def assertNotFound(outcome: Either[Throwable, Exhibition], context: String): Unit =
    outcome match
      case Left(ApiException(error)) => assertEquals(error.code, ErrorCode.NotFound, context)
      case other => fail(s"$context 应抛 NOT_FOUND，实际: $other")
