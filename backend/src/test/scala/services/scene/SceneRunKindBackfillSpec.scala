package services.scene

import cats.effect.IO
import cats.syntax.all.*

import munit.CatsEffectSuite

import services.scene.objects.{SceneRun, SceneRunId, SceneRunKind, SceneRunStatus}
import services.scene.tables.{SceneRunTable, SceneRunTableInitializer}
import services.system.db.{Sql, SqlValue}

/**
 * 阶段 4 kind 存量回填（api-contract v1.14 §4.1 / spec §7）：
 * 旧行 restored_from 非空 → restore、其余 → generate；只更新仍为 generate 的行，
 * 幂等重跑不覆盖已写入的 revise/restore。
 */
class SceneRunKindBackfillSpec extends CatsEffectSuite with SceneTestSupport:

  test("kind 回填：restored_from 非空→restore、其余保持 generate；重跑不覆盖 revise") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        plain <- newRun(userId, exhibitionId, photos, status = SceneRunStatus.Succeeded)
        restored <- newRun(userId, exhibitionId, photos, status = SceneRunStatus.Succeeded)
                      .map(_.copy(restoredFrom = Some(plain.id)))
        revise <- newRun(userId, exhibitionId, photos, status = SceneRunStatus.Succeeded)
                    .map(_.copy(kind = SceneRunKind.Revise, parentRunId = Some(plain.id)))
        _ <- SceneRunTable.insert(connection, plain)
        _ <- SceneRunTable.insert(connection, restored)
        _ <- SceneRunTable.insert(connection, revise)
        // 模拟“旧行”与“已写入的 revise”：直接把 kind 改回 generate / 保留 revise，并让 revise 也带 restored_from。
        _ <- Sql.update(
               connection,
               "UPDATE scene.scene_runs SET kind = 'generate' WHERE id IN (?, ?)",
               List(SqlValue.Uuid(plain.id.value), SqlValue.Uuid(restored.id.value))
             )
        _ <- Sql.update(
               connection,
               "UPDATE scene.scene_runs SET restored_from = ? WHERE id = ?",
               List(SqlValue.Uuid(plain.id.value), SqlValue.Uuid(revise.id.value))
             )
        _ <- SceneRunTableInitializer.backfillRunKinds(connection)
        afterFirst <- loadKinds(connection, List(plain.id, restored.id, revise.id))
        _ = assertEquals(afterFirst, List(SceneRunKind.Generate, SceneRunKind.Restore, SceneRunKind.Revise))

        _ <- SceneRunTableInitializer.backfillRunKinds(connection)
        afterSecond <- loadKinds(connection, List(plain.id, restored.id, revise.id))
        _ = assertEquals(afterSecond, afterFirst, "幂等重跑不改变回填结果")
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("新运行显式写入 kind：generate/revise/restore 均原样读回") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        generate <- newRun(userId, exhibitionId, photos, status = SceneRunStatus.Succeeded)
        revise <- newRun(userId, exhibitionId, photos, status = SceneRunStatus.Succeeded)
                    .map(_.copy(kind = SceneRunKind.Revise, parentRunId = Some(generate.id)))
        restore <- newRun(userId, exhibitionId, photos, status = SceneRunStatus.Succeeded)
                     .map(_.copy(kind = SceneRunKind.Restore))
        _ <- List(generate, revise, restore).traverse_(run => SceneRunTable.insert(connection, run))
        loaded <- List(generate.id, revise.id, restore.id).traverse(id => requireRun(connection, id))
        _ = assertEquals(loaded.map(_.kind), List(SceneRunKind.Generate, SceneRunKind.Revise, SceneRunKind.Restore))
        _ = assertEquals(loaded.map(_.parentRunId), List(None, Some(generate.id), None))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  private def loadKinds(connection: java.sql.Connection, ids: List[SceneRunId]): IO[List[SceneRunKind]] =
    ids.traverse(id => requireRun(connection, id)).map(_.map(_.kind))
