package services.gallery.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** gallery.photo_memories 建表与索引初始化（api-contract v1.9 / midterm-plan §2）；幂等。
  * 采用后讲述独立于投稿生命周期：contribution_id 唯一（采用目标锁定）但不设外键级联。 */
object PhotoMemoryTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS gallery"

  private val createTableSql =
    """CREATE TABLE IF NOT EXISTS gallery.photo_memories (
      |  id uuid PRIMARY KEY,
      |  photo_id uuid NOT NULL REFERENCES gallery.exhibition_photos(id) ON DELETE CASCADE,
      |  contribution_id uuid NOT NULL UNIQUE,
      |  contributor_user_id uuid NOT NULL,
      |  contributor_name text NOT NULL,
      |  text text NOT NULL,
      |  adopted_version int NOT NULL CHECK (adopted_version >= 1),
      |  created_at timestamptz NOT NULL,
      |  updated_at timestamptz NOT NULL
      |)""".stripMargin

  private val createPhotoIndexSql =
    "CREATE INDEX IF NOT EXISTS photo_memories_photo_id_idx ON gallery.photo_memories (photo_id)"

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createTableSql)
      _ <- Sql.update(connection, createPhotoIndexSql)
    yield ()
