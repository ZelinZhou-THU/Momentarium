package services.scene

import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*

import services.FourPagesFixtures
import services.FourPagesFixtures.t0
import services.gallery.api.{GetExhibitionMessage, PublishExhibitionMessage}
import services.gallery.objects.*
import services.gallery.tables.*
import services.scene.api.{
  AcceptSceneRunMessage,
  GetPublishedSceneMessage,
  GetSceneRunByIdMessage,
  ListSceneRunsMessage,
  RestoreSceneRunMessage
}
import services.scene.objects.*
import services.scene.tables.SceneRunTable
import services.scene.utils.SceneContract
import services.system.api.{ApiException, ErrorCode}
import services.system.db.{Database, Sql, SqlValue}
import services.users.objects.UserId

/**
 * 版本历史与恢复（v1.14 指针语义）：isCurrent 只比较 current_scene_run_id；
 * restore 成功切指针、已是当前幂等；恢复后展览提示未发布更改，重新发布后公开页使用恢复的场景。
 */
class SceneRunHistoryApiSpec extends munit.FunSuite:
  test("版本历史：最新在前且标出当前；非作者 404；恢复后成为当前且幂等；进行中拒绝恢复") {
    FourPagesFixtures.withDatabase(scenario).unsafeRunSync()
  }

  test("恢复旧版本后展览提示有未发布更改，重新发布后公开页使用恢复的场景") {
    FourPagesFixtures.withDatabase(republishScenario).unsafeRunSync()
  }

  private def republishScenario(database: Database): IO[Unit] =
    val owner = UserId(UUID.randomUUID())
    val exhibitionId = ExhibitionId(UUID.randomUUID())
    val groupId = GroupId(UUID.randomUUID())
    val photos = (1 to 3).toList.map(index => FourPagesFixtures.photo(exhibitionId, groupId, index))
    val runtime = SceneContract.RuntimeVersion
    val older = FourPagesFixtures.succeededRun(owner, exhibitionId, photos.map(_.id), t0, "旧的海", runtime)
    val newer = FourPagesFixtures.succeededRun(owner, exhibitionId, photos.map(_.id), t0.plusSeconds(600), "新的海", runtime)
    val body = for
      _ <- database.use { connection =>
             for
               _ <- ExhibitionTable.insert(connection, FourPagesFixtures.exhibition(exhibitionId, owner, "雾港"))
               _ <- ExhibitionGroupTable.insert(connection, ExhibitionGroup(groupId, exhibitionId, "章一", "", 0))
               _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
               _ <- List(older, newer).traverse_(run => SceneRunTable.insert(connection, run))
               _ <- ExhibitionTable.setCurrentSceneRun(connection, exhibitionId, newer.id, t0.plusSeconds(600))
             yield ()
           }
      _ <- database.use(connection => PublishExhibitionMessage(owner, exhibitionId).plan(connection))
      published <- database.use(connection => GetExhibitionMessage(owner, exhibitionId).plan(connection))
      _ <- IO(assertEquals(published.hasUnpublishedChanges, false))
      _ <- IO(assertEquals(published.currentSceneRun.map(_.runId), Some(newer.id)))

      _ <- database.use(connection => RestoreSceneRunMessage(owner, older.id).plan(connection))
      afterRestore <- database.use(connection => GetExhibitionMessage(owner, exhibitionId).plan(connection))
      _ <- IO(assertEquals(afterRestore.hasUnpublishedChanges, true))
      _ <- IO(assertEquals(afterRestore.currentSceneRun.map(_.kind), Some(SceneRunKind.Restore)))
      stillOld <- database.use(connection => GetPublishedSceneMessage(exhibitionId).plan(connection))
      _ <- IO(assertEquals(Option(stillOld.code), newer.code))

      _ <- database.use(connection => PublishExhibitionMessage(owner, exhibitionId).plan(connection))
      republished <- database.use(connection => GetExhibitionMessage(owner, exhibitionId).plan(connection))
      _ <- IO(assertEquals(republished.hasUnpublishedChanges, false))
      publicScene <- database.use(connection => GetPublishedSceneMessage(exhibitionId).plan(connection))
      _ <- IO(assertEquals(Option(publicScene.code), older.code))
    yield ()
    body.guarantee(cleanup(database, owner, exhibitionId))

  private def scenario(database: Database): IO[Unit] =
    val owner = UserId(UUID.randomUUID())
    val stranger = UserId(UUID.randomUUID())
    val exhibitionId = ExhibitionId(UUID.randomUUID())
    val groupId = GroupId(UUID.randomUUID())
    val photos = (1 to 3).toList.map(index => FourPagesFixtures.photo(exhibitionId, groupId, index))
    val runtime = SceneContract.RuntimeVersion
    val older = FourPagesFixtures.succeededRun(owner, exhibitionId, photos.map(_.id), t0, "旧的海", runtime)
    val newer = FourPagesFixtures.succeededRun(owner, exhibitionId, photos.map(_.id), t0.plusSeconds(600), "新的海", runtime)
    val legacy = FourPagesFixtures.succeededRun(owner, exhibitionId, photos.map(_.id), t0.minusSeconds(600), "旧运行时", "legacy-0")
    val body = for
      _ <- database.use { connection =>
             for
               _ <- ExhibitionTable.insert(connection, FourPagesFixtures.exhibition(exhibitionId, owner, "雾港"))
               _ <- ExhibitionGroupTable.insert(connection, ExhibitionGroup(groupId, exhibitionId, "章一", "", 0))
               _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
               _ <- List(legacy, older, newer).traverse_(run => SceneRunTable.insert(connection, run))
               _ <- ExhibitionTable.setCurrentSceneRun(connection, exhibitionId, newer.id, t0.plusSeconds(600))
             yield ()
           }
      history <- database.use(connection => ListSceneRunsMessage(owner, exhibitionId).plan(connection))
      _ <- IO(assertEquals(history.runs.map(_.runId), List(newer.id, older.id, legacy.id)))
      _ <- IO(assertEquals(history.runs.map(_.isCurrent), List(true, false, false)))
      _ <- IO(assertEquals(history.runs.map(_.restorable), List(true, true, false)))
      _ <- IO(assert(history.runs.forall(_.matchesCurrentDraft)))
      _ <- IO(assertEquals(history.runs.map(_.acceptable), List(false, false, false)))
      _ <- expectCode(database.use(connection => ListSceneRunsMessage(stranger, exhibitionId).plan(connection)), ErrorCode.NotFound)

      full <- database.use(connection => GetSceneRunByIdMessage(owner, older.id).plan(connection))
      _ <- IO(assertEquals(full.code, older.code))
      _ <- IO(assertEquals(full.isCurrent, false))
      _ <- IO(assertEquals(full.kind, SceneRunKind.Generate))
      _ <- expectCode(database.use(connection => GetSceneRunByIdMessage(stranger, older.id).plan(connection)), ErrorCode.NotFound)
      _ <- expectCode(database.use(connection => RestoreSceneRunMessage(owner, legacy.id).plan(connection)), ErrorCode.Validation)

      restored <- database.use(connection => RestoreSceneRunMessage(owner, older.id).plan(connection))
      _ <- IO(assertEquals(restored.code, older.code))
      _ <- IO(assertEquals(restored.kind, SceneRunKind.Restore))
      _ <- IO(assertEquals(restored.isCurrent, true))
      pointer <- database.use(connection => ExhibitionTable.findById(connection, exhibitionId))
      _ <- IO(assertEquals(pointer.flatMap(_.currentSceneRunId), Some(restored.runId)))
      restoredRow <- database.use(connection => SceneRunTable.findById(connection, restored.runId))
      _ <- IO(assertEquals(restoredRow.flatMap(_.restoredFrom), Some(older.id)))

      again <- database.use(connection => RestoreSceneRunMessage(owner, restored.runId).plan(connection))
      _ <- IO(assertEquals(again.runId, restored.runId))

      queued = older.copy(id = SceneRunId(UUID.randomUUID()), status = SceneRunStatus.Queued, source = None, createdAt = t0.plusSeconds(1200))
      _ <- database.use(connection => SceneRunTable.insert(connection, queued))
      _ <- expectCode(database.use(connection => RestoreSceneRunMessage(owner, newer.id).plan(connection)), ErrorCode.Conflict)
      _ <- database.use(connection => SceneRunTable.cancelNonTerminal(connection, queued.id, t0.plusSeconds(1300))).void

      // 采用接口对非修订运行返回 409（不能把普通生成/恢复运行重标为当前）。
      _ <- expectConflictReason(
             database.use(connection => AcceptSceneRunMessage(owner, newer.id).plan(connection)),
             services.system.api.ConflictReason.SceneRunNotAcceptable
           )
    yield ()
    body.guarantee(cleanup(database, owner, exhibitionId))

  /** 只删除本测试随机 ID 创建的场景运行与展览（级联照片/章节/发布）；不清理历史残留。 */
  private def cleanup(database: Database, owner: UserId, exhibitionId: ExhibitionId): IO[Unit] =
    database
      .use { connection =>
        for
          _ <- Sql.update(
                 connection,
                 "DELETE FROM scene.scene_runs WHERE exhibition_id = ?",
                 List(SqlValue.Uuid(exhibitionId.value))
               )
          _ <- ExhibitionTable.delete(connection, exhibitionId, owner)
        yield ()
      }
      .attempt
      .void

  private def expectCode(action: IO[?], code: ErrorCode): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) => assertEquals(error.code, code)
      case other => fail(s"期望 $code，实际 $other")
    }

  private def expectConflictReason(
    action: IO[?],
    reason: services.system.api.ConflictReason
  ): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) =>
        assertEquals(error.code, ErrorCode.Conflict)
        assertEquals(
          error.details.flatMap(_.apply("reason")).flatMap(_.asString),
          Some(services.system.api.ConflictReason.toString(reason))
        )
      case other => fail(s"期望 409($reason)，实际 $other")
    }
