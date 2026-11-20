package services.gallery.tables

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.system.db.Sql

/** gallery.exhibition_photos 建表与索引初始化（v2.7 起含 adopted_from_contribution_id 与幂等迁移）。 */
object ExhibitionPhotoTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS gallery"

  private val createPhotosTableSql =
    """CREATE TABLE IF NOT EXISTS gallery.exhibition_photos (
      |  id uuid PRIMARY KEY,
      |  exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE,
      |  storage_key text NOT NULL,
      |  thumb_key text NOT NULL,
      |  original_name text NOT NULL,
      |  mime text NOT NULL,
      |  width int NULL,
      |  height int NULL,
      |  group_id uuid NULL REFERENCES gallery.exhibition_groups(id) ON DELETE SET NULL,
      |  position_in_group int NULL,
      |  caption text NOT NULL DEFAULT '',
      |  archived_at timestamptz NULL,
      |  adopted_from_contribution_id uuid NULL,
      |  created_at timestamptz NOT NULL
      |)""".stripMargin

  private val createExhibitionIndexSql =
    "CREATE INDEX IF NOT EXISTS exhibition_photos_exhibition_id_idx ON gallery.exhibition_photos (exhibition_id)"

  private val createGroupIndexSql =
    "CREATE INDEX IF NOT EXISTS exhibition_photos_group_id_idx ON gallery.exhibition_photos (group_id)"

  private val createAdoptedFromIndexSql =
    """CREATE INDEX IF NOT EXISTS exhibition_photos_adopted_from_contribution_id_idx
      |ON gallery.exhibition_photos (adopted_from_contribution_id)""".stripMargin

  /** 旧库升级：无 FK（初始化顺序先照片后投稿），仅补列 + 索引；历史值由启动回填。 */
  private val migrationSql: List[String] =
    List(
      "ALTER TABLE gallery.exhibition_photos ADD COLUMN IF NOT EXISTS adopted_from_contribution_id uuid NULL"
    )

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createPhotosTableSql)
      _ <- Sql.update(connection, createExhibitionIndexSql)
      _ <- Sql.update(connection, createGroupIndexSql)
      _ <- migrationSql.traverse_(sql => Sql.update(connection, sql))
      _ <- Sql.update(connection, createAdoptedFromIndexSql)
    yield ()
