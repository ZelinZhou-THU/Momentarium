package services.gallery.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** gallery.exhibition_groups 建表与索引初始化。 */
object ExhibitionGroupTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS gallery"

  private val createGroupsTableSql =
    """CREATE TABLE IF NOT EXISTS gallery.exhibition_groups (
      |  id uuid PRIMARY KEY,
      |  exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE,
      |  title text NOT NULL,
      |  narrative text NOT NULL DEFAULT '',
      |  position int NOT NULL
      |)""".stripMargin

  private val createExhibitionIndexSql =
    "CREATE INDEX IF NOT EXISTS exhibition_groups_exhibition_id_idx ON gallery.exhibition_groups (exhibition_id)"

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createGroupsTableSql)
      _ <- Sql.update(connection, createExhibitionIndexSql)
    yield ()
