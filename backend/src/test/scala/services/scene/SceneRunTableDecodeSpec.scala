package services.scene

import cats.effect.IO

import munit.CatsEffectSuite

import services.scene.objects.SceneRunStatus
import services.scene.tables.SceneRunTable
import services.system.db.{Sql, SqlValue}

/**
 * RowDecoder 严格解码的行为锁定测试：scene.scene_runs 的枚举/jsonb 列出现非法存储值时，
 * 读取必须失败并报出 表.列 位置（进入 IO 错误通道），而不是静默降级
 * （未知 status 变 failed、brief/review 变 None 会把数据事故伪装成正常业务状态）。
 * 脏数据由直写 SQL 注入（写读同源，正常流程不可能产生这些值）。
 */
class SceneRunTableDecodeSpec extends CatsEffectSuite with SceneTestSupport:

  test("合法行正常解码：status/kind 枚举与 photoIds jsonb 往返一致") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- newRun(userId, exhibitionId, photos)
        _ <- SceneRunTable.insert(connection, run)
        found <- SceneRunTable.findById(connection, run.id)
        _ <- cleanup(connection, exhibitionId)
      yield
        assertEquals(found.map(_.status), Some(SceneRunStatus.Queued))
        assertEquals(found.map(_.kind), Some(services.scene.objects.SceneRunKind.Generate))
        assertEquals(found.map(_.parentRunId), Some(None))
        assertEquals(found.map(_.photoIds), Some(photos.map(_.id)))
    }
  }

  test("未知 status 值解码失败（不再静默降级为 failed）") {
    decodeFailsAfterCorrupting("status", "'bogus'", "scene.scene_runs.status")
  }

  test("非法 source 值解码失败（不再静默变 None）") {
    decodeFailsAfterCorrupting("source", "'bogus'", "scene.scene_runs.source")
  }

  test("非法 kind 值解码失败（运行起因是封闭枚举）") {
    decodeFailsAfterCorrupting("kind", "'bogus'", "scene.scene_runs.kind")
  }

  test("brief_json 结构不匹配解码失败（不再静默变 None）") {
    decodeFailsAfterCorrupting("brief_json", "'{\"x\":1}'::jsonb", "scene.scene_runs.brief_json")
  }

  test("review_json 结构不匹配解码失败") {
    decodeFailsAfterCorrupting("review_json", "'{\"x\":1}'::jsonb", "scene.scene_runs.review_json")
  }

  test("runtime_json 结构不匹配解码失败") {
    decodeFailsAfterCorrupting("runtime_json", "'{\"x\":1}'::jsonb", "scene.scene_runs.runtime_json")
  }

  test("photo_ids 不匹配 List[PhotoId] 时解码失败") {
    decodeFailsAfterCorrupting("photo_ids", "'[1,2]'::jsonb", "scene.scene_runs.photo_ids")
  }

  private def decodeFailsAfterCorrupting(column: String, sqlValue: String, reportedColumn: String): IO[Unit] =
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- newRun(userId, exhibitionId, photos)
        _ <- SceneRunTable.insert(connection, run)
        corrupted <- Sql.update(
                       connection,
                       s"UPDATE scene.scene_runs SET $column = $sqlValue WHERE id = ?",
                       List(SqlValue.Uuid(run.id.value))
                     )
        outcome <- SceneRunTable.findById(connection, run.id).attempt
        _ <- cleanup(connection, exhibitionId)
      yield
        assertEquals(corrupted, 1)
        outcome match
          case Left(error: IllegalStateException) => assert(error.getMessage.contains(reportedColumn))
          case other                              => fail(s"损坏 $column 应触发解码失败，实际: $other")
    }
