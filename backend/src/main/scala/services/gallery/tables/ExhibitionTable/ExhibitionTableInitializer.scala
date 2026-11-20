package services.gallery.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** gallery.exhibitions 建表与索引初始化。 */
object ExhibitionTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS gallery"

  private val createExhibitionsTableSql =
    """CREATE TABLE IF NOT EXISTS gallery.exhibitions (
      |  id uuid PRIMARY KEY,
      |  owner_id uuid NOT NULL,
      |  title text NOT NULL,
      |  narrative text NOT NULL DEFAULT '',
      |  curation_version int NOT NULL DEFAULT 0,
      |  cover_kind text NOT NULL DEFAULT 'auto',
      |  cover_photo_id uuid NULL,
      |  cover_storage_key text NULL,
      |  cover_mime text NULL,
      |  cover_width int NULL,
      |  cover_height int NULL,
      |  current_scene_run_id uuid NULL,
      |  created_at timestamptz NOT NULL,
      |  updated_at timestamptz NOT NULL
      |)""".stripMargin

  private val createOwnerIndexSql =
    "CREATE INDEX IF NOT EXISTS exhibitions_owner_id_idx ON gallery.exhibitions (owner_id)"

  /** 阶段 4（v1.14）：当前采用场景指针；旧展览由一次性 JVM 迁移回填，不在启动流程里兜底。 */
  private val addCurrentSceneRunIdColumnSql =
    "ALTER TABLE gallery.exhibitions ADD COLUMN IF NOT EXISTS current_scene_run_id uuid NULL"

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createExhibitionsTableSql)
      _ <- Sql.update(connection, createOwnerIndexSql)
      _ <- Sql.update(connection, addCurrentSceneRunIdColumnSql)
    yield ()
