package services.system.migrations

import java.nio.file.{Files, Path}
import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*

import services.FourPagesFixtures
import services.FourPagesFixtures.t0
import services.gallery.objects.*
import services.gallery.tables.*
import services.scene.objects.*
import services.scene.tables.SceneRunTable
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Sql, SqlValue}
import services.users.objects.UserId

/**
 * 阶段 4 当前场景指针回填迁移测试（真实测试库）：
 * 只填空指针、按原排序取最新 succeeded（created_at DESC, id DESC）、无成功运行保留空、
 * 已有指针不覆盖、重跑幂等；迁移入口写完成标记/摘要。
 */
class CurrentSceneRunBackfillSpec extends munit.FunSuite:

  test("指针回填：只填空、取最新成功、无成功保留空、已有指针不覆盖、重跑幂等") {
    FourPagesFixtures.withDatabase { database =>
      val owner = UserId(UUID.randomUUID())
      val fillable = ExhibitionId(UUID.randomUUID())
      val empty = ExhibitionId(UUID.randomUUID())
      val preserved = ExhibitionId(UUID.randomUUID())
      val tieBreak = ExhibitionId(UUID.randomUUID())
      val preservedRunId = SceneRunId(UUID.randomUUID())
      val newestRunId = SceneRunId(UUID.randomUUID())
      val tieRunId = SceneRunId(UUID.fromString("00000000-0000-0000-0000-000000000002"))
      val tieOtherRunId = SceneRunId(UUID.fromString("00000000-0000-0000-0000-000000000001"))

      val body = for
        _ <- seedExhibition(database, fillable, owner)
        _ <- seedExhibition(database, empty, owner)
        _ <- seedExhibition(database, preserved, owner)
        _ <- seedExhibition(database, tieBreak, owner)
        // fillable：旧 succeeded + 新 succeeded + 更晚的 failed → 迁移取最新 succeeded。
        older = succeededRun(owner, fillable, t0)
        newer = older.copy(id = newestRunId, createdAt = t0.plusSeconds(600), updatedAt = t0.plusSeconds(600))
        failed = older.copy(
                   id = SceneRunId(UUID.randomUUID()),
                   status = SceneRunStatus.Failed,
                   source = None,
                   createdAt = t0.plusSeconds(1200),
                   updatedAt = t0.plusSeconds(1200)
                 )
        _ <- database.use(connection =>
               List(older, newer, failed).traverse_(run => SceneRunTable.insert(connection, run))
             )
        // empty：只有 failed，应保留空指针。
        _ <- database.use(connection =>
               SceneRunTable.insert(
                 connection,
                 older.copy(id = SceneRunId(UUID.randomUUID()), exhibitionId = empty, status = SceneRunStatus.Failed, source = None)
               )
             )
        // preserved：已有指针指向较旧运行；即使存在更新的 succeeded 也不覆盖。
        _ <- database.use { connection =>
               for
                 _ <- SceneRunTable.insert(connection, succeededRunOf(owner, preserved, preservedRunId, t0))
                 _ <- SceneRunTable.insert(connection, succeededRunOf(owner, preserved, SceneRunId(UUID.randomUUID()), t0.plusSeconds(600)))
                 _ <- ExhibitionTable.setCurrentSceneRun(connection, preserved, preservedRunId, t0)
               yield ()
             }

        // tieBreak：同一 createdAt 的两个 succeeded，按原排序 created_at DESC, id DESC 取较大 id。
        _ <- database.use { connection =>
               for
                 _ <- SceneRunTable.insert(connection, succeededRunOf(owner, tieBreak, tieOtherRunId, t0))
                 _ <- SceneRunTable.insert(connection, succeededRunOf(owner, tieBreak, tieRunId, t0))
               yield ()
             }

        first <- runBackfill(database)
        pointers <- database.use { connection =>
                      for
                        fillablePointer <- pointerOf(connection, fillable)
                        emptyPointer <- pointerOf(connection, empty)
                        preservedPointer <- pointerOf(connection, preserved)
                        tieBreakPointer <- pointerOf(connection, tieBreak)
                      yield (fillablePointer, emptyPointer, preservedPointer, tieBreakPointer)
                    }
        _ = assertEquals(pointers._1, Some(newestRunId), "空指针按最新 succeeded 回填")
        _ = assertEquals(pointers._2, None, "无成功运行保留空")
        _ = assertEquals(pointers._3, Some(preservedRunId), "已有指针不覆盖")
        _ = assertEquals(pointers._4, Some(tieRunId), "同一时间按 id DESC 取最新 succeeded")
        _ = assert(first.pointersFilled >= 1, "本次应至少回填 1 个展览")
        _ = assert(first.pointersSkippedExisting >= 1, "已有指针的展览计入跳过")
        _ = assert(first.exhibitionsWithoutSucceededRun >= 1, "无成功运行的展览计入保留空")
        _ = assertEquals(first.failures, Nil)

        second <- runBackfill(database)
        _ = assertEquals(second.pointersFilled, 0, "重跑不再回填任何展览（幂等）")
        fillableAfterSecond <- database.use(connection => pointerOf(connection, fillable))
        _ = assertEquals(fillableAfterSecond, Some(newestRunId), "重跑不改变已回填指针")
      yield ()
      body.guarantee(cleanup(database, owner, List(fillable, empty, preserved, tieBreak)))
    }.unsafeRunSync()
  }

  test("迁移入口：写 DATA_DIR/migrations 完成标记与摘要，可重复执行") {
    FourPagesFixtures.withDatabase { database =>
      val tempDirectory = Files.createTempDirectory("momentarium-pointer-backfill-")
      val owner = UserId(UUID.randomUUID())
      val exhibitionId = ExhibitionId(UUID.randomUUID())
      val runId = SceneRunId(UUID.randomUUID())
      val body = for
        config <- loadConfig(tempDirectory)
        _ <- seedExhibition(database, exhibitionId, owner)
        _ <- database.use(connection => SceneRunTable.insert(connection, succeededRunOf(owner, exhibitionId, runId, t0)))
        first <- BackfillCurrentSceneRunIds.execute(database, config)
        markerExists <- IO.blocking(Files.isRegularFile(first.markerPath))
        markerText <- IO.blocking(Files.readString(first.markerPath))
        pointer <- database.use(connection => pointerOf(connection, exhibitionId))
        _ = assert(markerExists, "应写完成标记文件")
        _ = assert(markerText.contains(BackfillCurrentSceneRunIds.MigrationName))
        _ = assert(markerText.contains("\"status\":\"completed\""), s"marker=$markerText")
        _ = assert(markerText.contains("\"summary\""))
        _ = assertEquals(pointer, Some(runId))
        _ = assert(first.report.pointersFilled >= 1)
        second <- BackfillCurrentSceneRunIds.execute(database, config)
        _ = assertEquals(second.report.pointersFilled, 0, "可重复执行且不再重复回填")
      yield ()
      body.guarantee(
        cleanup(database, owner, List(exhibitionId)) *> IO.blocking(deleteDirectory(tempDirectory))
      )
    }.unsafeRunSync()
  }

  // ---------- 辅助 ----------

  private def runBackfill(database: Database): IO[CurrentSceneRunBackfillReport] =
    database.use(connection => BackfillCurrentSceneRunIds.backfill(connection))

  private def pointerOf(connection: java.sql.Connection, exhibitionId: ExhibitionId): IO[Option[SceneRunId]] =
    ExhibitionTable.findById(connection, exhibitionId).map(_.flatMap(_.currentSceneRunId))

  private def seedExhibition(database: Database, exhibitionId: ExhibitionId, owner: UserId): IO[Unit] =
    database.use { connection =>
      for
        _ <- ExhibitionTable.insert(connection, FourPagesFixtures.exhibition(exhibitionId, owner, "回填展"))
        _ <- ExhibitionGroupTable.insert(
               connection,
               ExhibitionGroup(GroupId(UUID.randomUUID()), exhibitionId, "章一", "", 0)
             )
      yield ()
    }

  private def succeededRun(owner: UserId, exhibitionId: ExhibitionId, createdAt: java.time.Instant): SceneRun =
    succeededRunOf(owner, exhibitionId, SceneRunId(UUID.randomUUID()), createdAt)

  private def succeededRunOf(
    owner: UserId,
    exhibitionId: ExhibitionId,
    runId: SceneRunId,
    createdAt: java.time.Instant
  ): SceneRun =
    FourPagesFixtures
      .succeededRun(owner, exhibitionId, Nil, createdAt, "海", "1")
      .copy(id = runId)

  private def loadConfig(dataDirectory: Path): IO[AppConfig] =
    DotEnv.load(Path.of(".env")).flatMap { dotEnv =>
      AppConfig.load(dotEnv ++ sys.env ++ Map("DATA_DIR" -> dataDirectory.toString)) match
        case Right(config) => IO.pure(config)
        case Left(error) => IO.raiseError(new IllegalStateException(s"测试配置无效：$error"))
    }

  private def cleanup(database: Database, owner: UserId, exhibitionIds: List[ExhibitionId]): IO[Unit] =
    database
      .use { connection =>
        for
          _ <- exhibitionIds.traverse_(exhibitionId =>
                 Sql.update(
                   connection,
                   "DELETE FROM scene.scene_runs WHERE exhibition_id = ?",
                   List(SqlValue.Uuid(exhibitionId.value))
                 )
               )
          _ <- exhibitionIds.traverse_(exhibitionId => ExhibitionTable.delete(connection, exhibitionId, owner))
        yield ()
      }
      .attempt
      .void

  private def deleteDirectory(directory: Path): Unit =
    import scala.jdk.CollectionConverters.*
    if Files.exists(directory) then
      Files.walk(directory).iterator().asScala.toList.sortBy(_.getNameCount).reverse.foreach(Files.deleteIfExists)
