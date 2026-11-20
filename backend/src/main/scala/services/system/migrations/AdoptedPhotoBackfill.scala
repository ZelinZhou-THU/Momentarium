package services.system.migrations

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** 阶段 2.7 一次性幂等回填：把“由投稿采用新建、但历史行没有 origin 字段”的草稿照片补上归属。
  *
  * 旧实现用 `photo.created_at == memory.created_at` 推断新建照片目标；回填按同一规则（每张照片取最早匹配讲述，DISTINCT ON 保证确定性）
  * 写入 `adopted_from_contribution_id`。只更新字段为 NULL 的旧行，重复执行无副作用；关联已有照片（时间戳不等）保持 NULL。
  * 必须由 BackfillLegacyFields 在 PhotoMemoryTableInitializer 之后显式执行，不挂常规启动。
  */
object AdoptedPhotoBackfill:
  private val backfillSql =
    """UPDATE gallery.exhibition_photos photo
      |SET adopted_from_contribution_id = candidate.contribution_id
      |FROM (
      |  SELECT DISTINCT ON (memory.photo_id) memory.photo_id, memory.contribution_id
      |  FROM gallery.photo_memories memory
      |  JOIN gallery.exhibition_photos created ON created.id = memory.photo_id
      |  WHERE created.created_at = memory.created_at
      |  ORDER BY memory.photo_id, memory.created_at, memory.id
      |) candidate
      |WHERE photo.id = candidate.photo_id
      |  AND photo.adopted_from_contribution_id IS NULL""".stripMargin

  /** 返回受影响行数；一次性迁移专用。 */
  def backfill(connection: Connection): IO[Int] =
    Sql.update(connection, backfillSql)
